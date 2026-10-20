const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'attachment-preview.js'), 'utf8');

const pageLink = (id, name, suffix = '') => `<p><a href="/attachments/${id}${suffix}">${name}</a></p>`;
const attachmentLink = (id, name) => `<a href="/attachments/${id}"><span class="label">${name}</span></a>`;

const createDom = ({pageLinks, attachments, script = source}) => {
  const dom = new JSDOM(`<!doctype html>
    <html><head>
      <script src="https://bookstack.test/theme/file-preview/attachment-preview.min.js"
        data-attachment-preview-base="https://bookstack.test/theme/file-preview/"></script>
    </head><body>
      <main class="page-content">${pageLinks}</main>
      <aside id="page-attachments">${attachments}</aside>
    </body></html>`, {
    url: 'https://bookstack.test/books/preview/page/files',
    runScripts: 'outside-only',
  });

  const observers = [];
  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = new Set();
      observers.push(this);
    }

    observe(element) {
      this.targets.add(element);
    }

    unobserve(element) {
      this.targets.delete(element);
    }

    trigger(element) {
      this.callback([{target: element, isIntersecting: true}], this);
    }
  }

  dom.window.IntersectionObserver = FakeIntersectionObserver;
  dom.window.eval(script);
  if (dom.window.document.readyState === 'loading') {
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', {bubbles: true}));
  }

  return {dom, observers};
};

const triggerVisibility = (observers, element) => {
  const observer = observers.find((candidate) => candidate.targets.has(element));
  assert.ok(observer, 'preview body should be observed until it becomes visible');
  observer.trigger(element);
};

const waitUntil = async (condition, message) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
};

test('creates accessible previews only for attachments listed on the page', () => {
  const {dom} = createDom({
    pageLinks: `${pageLink(101, 'Quarterly report.pdf')}<p><a href="/attachments/999">Unlisted.txt</a></p>
      <p><a href="https://other.test/attachments/103">External.pdf</a></p>`,
    attachments: `${attachmentLink(101, 'Quarterly report.pdf')}${attachmentLink(102, 'Image.png')}`,
  });
  const {document} = dom.window;

  assert.equal(document.querySelectorAll('.attachment-preview').length, 1);
  assert.equal(document.querySelector('.attachment-preview__title-link').textContent, 'Quarterly report.pdf');
  assert.equal(document.querySelector('.attachment-preview__badge').textContent, 'PDF');
  assert.equal(document.querySelector('.attachment-preview__action--open').target, '_blank');
  assert.equal(document.querySelector('.attachment-preview__action--open').rel, 'noopener noreferrer');
  assert.match(document.querySelector('.attachment-preview__action--open').href, /open=true/);
  assert.ok(document.querySelector('.attachment-preview__action--download').hasAttribute('download'));
  assert.equal(document.querySelector('.page-content a[href="/attachments/999"]').textContent, 'Unlisted.txt');
  assert.equal(document.querySelector('.page-content a[href^="https://other.test"]').textContent, 'External.pdf');

  const toggle = document.querySelector('.attachment-preview__toggle');
  const body = document.getElementById(toggle.getAttribute('aria-controls'));
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(body.hidden, true);
  assert.equal(toggle.querySelector('.attachment-preview__toggle-label').textContent, 'Ausklappen');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(body.hidden, false);

  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  assert.equal(document.querySelectorAll('.attachment-preview').length, 1, 'running the script twice must not duplicate cards');
  dom.window.close();
});

test('uses native media elements and defers their source until the preview is near view', () => {
  const {dom, observers} = createDom({
    pageLinks: `${pageLink(201, 'cover.webp')}${pageLink(202, 'intro.mp4')}${pageLink(203, 'sound.mp3')}`,
    attachments: `${attachmentLink(201, 'cover.webp')}${attachmentLink(202, 'intro.mp4')}${attachmentLink(203, 'sound.mp3')}`,
  });
  const {document} = dom.window;
  const image = document.querySelector('.attachment-preview__image');
  const video = document.querySelector('video');
  const audio = document.querySelector('audio');

  assert.equal(image.loading, 'lazy');
  assert.equal(image.getAttribute('src'), null);
  assert.equal(video.preload, 'none');
  assert.equal(video.getAttribute('src'), null);
  assert.equal(audio.preload, 'none');
  assert.equal(audio.getAttribute('src'), null);

  document.querySelectorAll('.attachment-preview__body').forEach((body) => triggerVisibility(observers, body));
  assert.match(image.src, /attachments\/201\?open=true/);
  assert.match(video.src, /attachments\/202\?open=true/);
  assert.match(audio.src, /attachments\/203\?open=true/);
  dom.window.close();
});

test('loads local spreadsheet code on demand, bounds the table and renders cell values as text', async () => {
  const {dom, observers} = createDom({
    pageLinks: pageLink(301, 'Budget.xlsx'),
    attachments: attachmentLink(301, 'Budget.xlsx'),
  });
  const {window} = dom;
  const document = window.document;
  const requestedScripts = [];
  let fetchCount = 0;
  let encodedRange = null;
  let jsonOptions = null;
  let readOptions = null;
  const xlsx = {
    read: (_bytes, options) => {
      readOptions = options;
      return {SheetNames: ['Budget'], Sheets: {Budget: {'!ref': 'A1:T100', '!fullref': 'A1:AD151'}}};
    },
    utils: {
      decode_range: (reference) => reference === 'A1:T100'
        ? {s: {r: 0, c: 0}, e: {r: 99, c: 19}}
        : {s: {r: 0, c: 0}, e: {r: 150, c: 29}},
      encode_range: (range) => {
        encodedRange = range;
        return 'A1:T100';
      },
      sheet_to_json: (_sheet, options) => {
        jsonOptions = options;
        return [['Quarter', 'Amount'], ['<img src=x onerror=alert(1)>', '<script>bad()</script>']];
      },
    },
  };

  window.fetch = async () => {
    fetchCount += 1;
    return {ok: true, headers: {get: () => null}, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer};
  };
  const nativeAppend = document.head.appendChild.bind(document.head);
  document.head.appendChild = (element) => {
    const appended = nativeAppend(element);
    if (element.tagName === 'SCRIPT' && element !== document.querySelector('head > script')) {
      requestedScripts.push(element.src);
      setTimeout(() => {
        window.AttachmentPreviewXLSX = xlsx;
        element.dispatchEvent(new window.Event('load'));
      }, 0);
    }
    return appended;
  };

  assert.deepEqual(requestedScripts, [], 'vendor bundle should not load during page initialization');
  const previewBody = document.querySelector('.attachment-preview__body');
  triggerVisibility(observers, previewBody);
  await waitUntil(() => document.querySelector('.attachment-preview__sheet table'), 'spreadsheet did not render');

  assert.equal(requestedScripts.length, 1);
  assert.match(requestedScripts[0], /^https:\/\/bookstack\.test\/theme\/file-preview\/xlsx-preview\.min\.js$/);
  assert.equal(fetchCount, 1);
  assert.equal(readOptions.sheetRows, 100, 'the spreadsheet parser should stop after the preview row limit');
  assert.equal(encodedRange.e.r, 99);
  assert.equal(encodedRange.e.c, 19);
  assert.equal(jsonOptions.range, 'A1:T100');
  assert.equal(document.querySelectorAll('.attachment-preview__sheet tr').length, 2);
  assert.equal(document.querySelector('.attachment-preview__sheet img'), null, 'cell content must not become executable HTML');
  assert.equal(document.querySelector('.attachment-preview__sheet script'), null);
  assert.equal(document.querySelectorAll('.attachment-preview__sheet td')[2].textContent, '<img src=x onerror=alert(1)>');
  assert.match(document.querySelector('.attachment-preview__truncated').textContent, /100 Zeilen und 20 Spalten/);
  dom.window.close();
});

test('rejects oversized spreadsheets before loading the vendor bundle or reading the file body', async () => {
  const {dom, observers} = createDom({
    pageLinks: pageLink(351, 'Large.xlsx'),
    attachments: attachmentLink(351, 'Large.xlsx'),
  });
  const {window} = dom;
  const document = window.document;
  let bodyReadCount = 0;
  const requestedScripts = [];
  window.fetch = async () => ({
    ok: true,
    headers: {get: () => String(26 * 1024 * 1024)},
    arrayBuffer: async () => {
      bodyReadCount += 1;
      return new ArrayBuffer(1);
    },
  });
  const nativeAppend = document.head.appendChild.bind(document.head);
  document.head.appendChild = (element) => {
    const appended = nativeAppend(element);
    if (element.tagName === 'SCRIPT' && element !== document.querySelector('head > script')) {
      requestedScripts.push(element.src);
    }
    return appended;
  };

  triggerVisibility(observers, document.querySelector('.attachment-preview__body'));
  await waitUntil(() => document.querySelector('.attachment-preview__sheet .attachment-preview__message--fallback'), 'large file fallback did not appear');
  assert.equal(bodyReadCount, 0, 'oversized attachments should be rejected from their response headers');
  assert.equal(requestedScripts.length, 0, 'oversized attachments should not load a large preview library');
  assert.match(document.querySelector('.attachment-preview__sheet').textContent, /zu groß/);
  dom.window.close();
});

test('shows a useful fallback when a locally bundled preview library fails to load', async () => {
  const {dom, observers} = createDom({
    pageLinks: pageLink(401, 'Operations.xlsx'),
    attachments: attachmentLink(401, 'Operations.xlsx'),
  });
  const {window} = dom;
  const document = window.document;
  window.fetch = async () => ({ok: true, headers: {get: () => null}, arrayBuffer: async () => new ArrayBuffer(4)});
  const nativeAppend = document.head.appendChild.bind(document.head);
  document.head.appendChild = (element) => {
    const appended = nativeAppend(element);
    if (element.tagName === 'SCRIPT' && element !== document.querySelector('head > script')) {
      setTimeout(() => element.dispatchEvent(new window.Event('error')), 0);
    }
    return appended;
  };

  triggerVisibility(observers, document.querySelector('.attachment-preview__body'));
  await waitUntil(() => document.querySelector('.attachment-preview__sheet .attachment-preview__message--fallback'), 'preview failure fallback did not appear');
  assert.match(document.querySelector('.attachment-preview__sheet').textContent, /Bitte öffne oder lade/);
  dom.window.close();
});

test('does not alter a page without attachment metadata', () => {
  const {dom} = createDom({
    pageLinks: pageLink(501, 'orphan.pdf'),
    attachments: '',
  });
  assert.equal(dom.window.document.querySelectorAll('.attachment-preview').length, 0);
  assert.ok(dom.window.document.querySelector('.page-content a[href="/attachments/501"]'));
  dom.window.close();
});
