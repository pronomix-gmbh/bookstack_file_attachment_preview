(() => {
  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
  const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mkv', 'ogg', 'avi']);
  const AUDIO_EXTENSIONS = new Set(['mp3', 'ogg', 'wav', 'flac', 'aac']);
  const SHEET_EXTENSIONS = new Set(['xlsx', 'xls']);
  const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;
  const MAX_SHEET_ROWS = 100;
  const MAX_SHEET_COLUMNS = 20;
  const LOCAL_BUNDLES = new Map();
  const ATTACHMENT_REQUESTS = new Map();

  const iconPath = {
    file: 'M6 2h8l4 4v16H6z M14 2v6h6',
    open: 'M14 3h7v7 M21 3l-9 9 M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6',
    download: 'M12 3v12 M7 10l5 5 5-5 M5 20h14',
    chevron: 'm6 9 6 6 6-6',
  };

  const makeIcon = (name, className) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (className) svg.setAttribute('class', className);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', iconPath[name]);
    path.setAttribute('fill', name === 'file' ? 'currentColor' : 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  };

  const attachmentIdFromHref = (href) => {
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return null;
      const match = url.pathname.match(/(?:^|\/)attachments\/(\d+)(?:\/|$)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  };

  const inlineUrl = (href) => {
    const url = new URL(href, window.location.href);
    url.searchParams.set('open', 'true');
    return url.toString();
  };

  const extensionFromName = (name = '') => {
    const cleanName = name.trim();
    const lastDot = cleanName.lastIndexOf('.');
    return lastDot === -1 ? '' : cleanName.slice(lastDot + 1).toLowerCase();
  };

  const getAttachmentMeta = () => {
    const meta = new Map();
    document.querySelectorAll('#page-attachments a[href*="/attachments/"]').forEach((link) => {
      const id = attachmentIdFromHref(link.getAttribute('href'));
      if (!id || meta.has(id)) return;

      const label = link.querySelector('.label');
      const name = (label ? label.textContent : link.textContent).trim();
      meta.set(id, {name, ext: extensionFromName(name)});
    });
    return meta;
  };

  const themeAssetUrl = (fileName) => {
    const script = document.currentScript || document.querySelector('script[data-attachment-preview-base]');
    const declaredBase = script && script.getAttribute('data-attachment-preview-base');
    const baseUrl = declaredBase
      ? new URL(declaredBase.endsWith('/') ? declaredBase : `${declaredBase}/`, window.location.href)
      : script && script.src
        ? new URL('.', script.src)
        : new URL('.', window.location.href);
    return new URL(fileName, baseUrl).toString();
  };

  const loadLocalBundle = (fileName, globalName) => {
    if (window[globalName]) return Promise.resolve(window[globalName]);

    const url = themeAssetUrl(fileName);
    if (!LOCAL_BUNDLES.has(url)) {
      const load = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;

        const nonceScript = document.querySelector('script[nonce]');
        if (nonceScript && nonceScript.nonce) script.nonce = nonceScript.nonce;

        script.addEventListener('load', () => {
          if (window[globalName]) {
            resolve(window[globalName]);
          } else {
            reject(new Error(`Preview bundle did not expose ${globalName}`));
          }
        }, {once: true});
        script.addEventListener('error', () => {
          script.remove();
          reject(new Error(`Could not load ${fileName}`));
        }, {once: true});

        (document.head || document.documentElement).appendChild(script);
      }).catch((error) => {
        LOCAL_BUNDLES.delete(url);
        throw error;
      });
      LOCAL_BUNDLES.set(url, load);
    }

    return LOCAL_BUNDLES.get(url);
  };

  const getAttachmentBytes = async (url, onAcceptedResponse) => {
    if (!ATTACHMENT_REQUESTS.has(url)) {
      const request = fetch(url, {credentials: 'same-origin'}).then(async (response) => {
        if (!response.ok) throw new Error('Attachment request failed');

        const headerLength = Number(response.headers && response.headers.get('content-length'));
        if (Number.isFinite(headerLength) && headerLength > MAX_PREVIEW_BYTES) {
          const error = new Error('Attachment exceeds preview size limit');
          error.code = 'PREVIEW_TOO_LARGE';
          throw error;
        }

        if (onAcceptedResponse) onAcceptedResponse();

        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > MAX_PREVIEW_BYTES) {
          const error = new Error('Attachment exceeds preview size limit');
          error.code = 'PREVIEW_TOO_LARGE';
          throw error;
        }
        return bytes;
      });
      ATTACHMENT_REQUESTS.set(url, request);
    }

    const request = ATTACHMENT_REQUESTS.get(url);
    try {
      return await request;
    } finally {
      if (ATTACHMENT_REQUESTS.get(url) === request) ATTACHMENT_REQUESTS.delete(url);
    }
  };

  const showMessage = (container, message, state = 'fallback') => {
    container.replaceChildren();
    const element = document.createElement('div');
    element.className = `attachment-preview__message attachment-preview__message--${state}`;
    element.textContent = message;
    if (state === 'loading') element.setAttribute('role', 'status');
    container.appendChild(element);
    return element;
  };

  const showPreviewError = (container, error) => {
    const message = error && error.code === 'PREVIEW_TOO_LARGE'
      ? 'Die Datei ist zu groß für eine schnelle Vorschau. Bitte öffne oder lade sie herunter.'
      : 'Die Vorschau ist gerade nicht verfügbar. Bitte öffne oder lade die Datei herunter.';
    showMessage(container, message);
  };

  const renderDocxPreview = async (url, container) => {
    showMessage(container, 'Word-Vorschau wird geladen …', 'loading');
    try {
      let bundlePromise;
      const bytes = await getAttachmentBytes(url, () => {
        bundlePromise = loadLocalBundle('docx-preview.min.js', 'AttachmentPreviewDocx');
      });
      const docx = await (bundlePromise || loadLocalBundle('docx-preview.min.js', 'AttachmentPreviewDocx'));
      await docx.renderAsync(new Blob([bytes]), container, container, {
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
      });
    } catch (error) {
      showPreviewError(container, error);
    }
  };

  const renderSheetPreview = async (url, container) => {
    showMessage(container, 'Tabellenvorschau wird geladen …', 'loading');
    try {
      let bundlePromise;
      const bytes = await getAttachmentBytes(url, () => {
        bundlePromise = loadLocalBundle('xlsx-preview.min.js', 'AttachmentPreviewXLSX');
      });
      const XLSX = await (bundlePromise || loadLocalBundle('xlsx-preview.min.js', 'AttachmentPreviewXLSX'));
      const workbook = XLSX.read(bytes, {type: 'array', sheetRows: MAX_SHEET_ROWS});
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : null;
      if (!sheet || !sheet['!ref']) throw new Error('The workbook has no previewable cells');

      const sourceRange = XLSX.utils.decode_range(sheet['!ref']);
      const originalRange = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
      const range = {
        s: sourceRange.s,
        e: {
          r: Math.min(sourceRange.e.r, sourceRange.s.r + MAX_SHEET_ROWS - 1),
          c: Math.min(sourceRange.e.c, sourceRange.s.c + MAX_SHEET_COLUMNS - 1),
        },
      };
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: true,
        range: XLSX.utils.encode_range(range),
      });

      if (!rows.length) throw new Error('The workbook has no previewable cells');

      const table = document.createElement('table');
      table.setAttribute('aria-label', 'Vorschau des ersten Arbeitsblatts');
      const body = document.createElement('tbody');
      rows.slice(0, MAX_SHEET_ROWS).forEach((row) => {
        const tr = document.createElement('tr');
        row.slice(0, MAX_SHEET_COLUMNS).forEach((value) => {
          const cell = document.createElement('td');
          cell.textContent = value == null ? '' : String(value);
          tr.appendChild(cell);
        });
        body.appendChild(tr);
      });
      table.appendChild(body);
      container.classList.add('attachment-preview__sheet');
      container.replaceChildren(table);

      const truncated = originalRange.e.r > range.e.r || originalRange.e.c > range.e.c;
      if (truncated) {
        const note = document.createElement('p');
        note.className = 'attachment-preview__truncated';
        note.textContent = `Die Vorschau zeigt höchstens ${MAX_SHEET_ROWS} Zeilen und ${MAX_SHEET_COLUMNS} Spalten.`;
        container.appendChild(note);
      }
    } catch (error) {
      showPreviewError(container, error);
    }
  };

  const observeWhenVisible = (element, callback) => {
    let started = false;
    let observer = null;
    const start = () => {
      if (started) return;
      started = true;
      if (observer) observer.unobserve(element);
      callback();
    };

    if (typeof window.IntersectionObserver !== 'function') {
      start();
      return start;
    }

    observer = new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) start();
      });
    }, {rootMargin: '240px 0px'});
    observer.observe(element);
    return start;
  };

  const createPreviewContent = (ext, url, name) => {
    const body = document.createElement('div');
    body.className = 'attachment-preview__body';
    body.setAttribute('role', 'region');
    body.setAttribute('aria-label', `Vorschau für ${name}`);

    if (ext === 'pdf') {
      const placeholder = showMessage(body, 'PDF-Vorschau wird bei Bedarf geladen.', 'loading');
      const object = document.createElement('object');
      object.className = 'attachment-preview__frame';
      object.type = 'application/pdf';
      object.setAttribute('aria-label', `PDF-Vorschau: ${name}`);
      object.hidden = true;
      const fallback = document.createElement('div');
      fallback.className = 'attachment-preview__fallback';
      fallback.textContent = 'Die PDF-Vorschau wird von diesem Browser nicht unterstützt. Nutze „Öffnen“ oder „Herunterladen“. ';
      object.appendChild(fallback);
      body.appendChild(object);

      return {
        body,
        lazy: true,
        load: () => {
          placeholder.remove();
          object.hidden = false;
          object.data = url;
        },
      };
    }

    if (IMAGE_EXTENSIONS.has(ext)) {
      const placeholder = showMessage(body, 'Bildvorschau wird bei Bedarf geladen.', 'loading');
      const image = document.createElement('img');
      image.className = 'attachment-preview__image';
      image.alt = name;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => showMessage(body, 'Das Bild konnte nicht geladen werden. Bitte öffne oder lade die Datei herunter.'));
      body.appendChild(image);

      return {
        body,
        lazy: true,
        load: () => {
          placeholder.remove();
          image.src = url;
        },
      };
    }

    if (VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) {
      const placeholder = showMessage(body, 'Medienvorschau wird bei Bedarf geladen.', 'loading');
      const media = document.createElement(VIDEO_EXTENSIONS.has(ext) ? 'video' : 'audio');
      media.className = 'attachment-preview__media';
      media.controls = true;
      media.preload = 'none';
      media.setAttribute('aria-label', `${VIDEO_EXTENSIONS.has(ext) ? 'Video' : 'Audio'}: ${name}`);
      media.addEventListener('error', () => showMessage(body, 'Die Mediendatei konnte nicht geladen werden. Bitte öffne oder lade sie herunter.'));
      body.appendChild(media);

      return {
        body,
        lazy: true,
        load: () => {
          placeholder.remove();
          media.src = url;
        },
      };
    }

    if (ext === 'docx') {
      const container = document.createElement('div');
      container.className = 'attachment-preview__docx';
      showMessage(container, 'Word-Vorschau wird beim Scrollen geladen.', 'loading');
      body.appendChild(container);
      return {body, lazy: true, load: () => renderDocxPreview(url, container)};
    }

    if (SHEET_EXTENSIONS.has(ext)) {
      const container = document.createElement('div');
      container.className = 'attachment-preview__sheet';
      showMessage(container, 'Tabellenvorschau wird beim Scrollen geladen.', 'loading');
      body.appendChild(container);
      return {body, lazy: true, load: () => renderSheetPreview(url, container)};
    }

    showMessage(body, 'Für diesen Dateityp ist keine Vorschau verfügbar. Du kannst die Datei öffnen oder herunterladen.');
    return {body, lazy: false, load: () => {}};
  };

  const createActionLink = (href, label, className, iconName) => {
    const link = document.createElement('a');
    link.href = href;
    link.className = className;
    link.appendChild(makeIcon(iconName));
    const text = document.createElement('span');
    text.textContent = label;
    link.appendChild(text);
    return link;
  };

  const placePreview = (link, attachmentMeta, index) => {
    if (link.dataset.attachmentPreview === 'true') return;

    const attachmentId = attachmentIdFromHref(link.getAttribute('href'));
    const meta = attachmentMeta.get(attachmentId);
    if (!attachmentId || !meta) return;

    const name = meta.name || link.textContent.trim() || `Anhang ${attachmentId}`;
    const ext = (meta.ext || extensionFromName(name)).toLowerCase();
    const previewUrl = inlineUrl(link.href);
    const originalAnchor = link.cloneNode(true);
    originalAnchor.classList.add('attachment-preview__title-link');

    link.dataset.attachmentPreview = 'true';
    const wrapper = document.createElement('section');
    wrapper.className = 'attachment-preview';
    wrapper.dataset.attachmentId = attachmentId;

    const header = document.createElement('div');
    header.className = 'attachment-preview__header';

    const identity = document.createElement('div');
    identity.className = 'attachment-preview__identity';
    const fileIcon = document.createElement('span');
    fileIcon.className = 'attachment-preview__file-icon';
    fileIcon.appendChild(makeIcon('file'));
    identity.appendChild(fileIcon);

    const title = document.createElement('span');
    title.className = 'attachment-preview__title';
    title.appendChild(originalAnchor);
    identity.appendChild(title);

    if (ext) {
      const badge = document.createElement('span');
      badge.className = 'attachment-preview__badge';
      badge.textContent = ext.toUpperCase();
      identity.appendChild(badge);
    }
    header.appendChild(identity);

    const actions = document.createElement('div');
    actions.className = 'attachment-preview__actions';
    const openLink = createActionLink(previewUrl, 'Öffnen', 'attachment-preview__action attachment-preview__action--open', 'open');
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    actions.appendChild(openLink);

    const downloadLink = createActionLink(link.href, 'Herunterladen', 'attachment-preview__action attachment-preview__action--download', 'download');
    downloadLink.setAttribute('download', '');
    actions.appendChild(downloadLink);

    const bodyId = `attachment-preview-body-${attachmentId}-${index}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'attachment-preview__toggle';
    toggle.setAttribute('aria-controls', bodyId);
    toggle.setAttribute('aria-expanded', 'true');
    toggle.appendChild(makeIcon('chevron'));
    const toggleText = document.createElement('span');
    toggleText.className = 'attachment-preview__toggle-label';
    toggleText.textContent = 'Einklappen';
    toggle.appendChild(toggleText);
    actions.appendChild(toggle);
    header.appendChild(actions);
    wrapper.appendChild(header);

    const preview = createPreviewContent(ext, previewUrl, name);
    preview.body.id = bodyId;
    wrapper.appendChild(preview.body);

    const startPreview = preview.lazy
      ? observeWhenVisible(preview.body, preview.load)
      : () => {};
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggleText.textContent = expanded ? 'Einklappen' : 'Ausklappen';
      preview.body.hidden = !expanded;
      if (expanded) startPreview();
    });

    const paragraph = link.closest('p');
    const heading = link.closest('h1, h2, h3, h4, h5, h6');
    const listItem = link.closest('li');
    if (paragraph) {
      paragraph.insertAdjacentElement('afterend', wrapper);
    } else if (heading) {
      heading.insertAdjacentElement('afterend', wrapper);
    } else if (listItem) {
      listItem.appendChild(wrapper);
    } else {
      link.insertAdjacentElement('afterend', wrapper);
    }
    link.remove();
  };

  const initAttachmentPreviews = () => {
    const pageContent = document.querySelector('.page-content');
    if (!pageContent) return;

    const attachmentMeta = getAttachmentMeta();
    if (!attachmentMeta.size) return;

    const links = pageContent.querySelectorAll('a[href*="/attachments/"]');
    let index = 0;
    links.forEach((link) => {
      if (link.closest('.attachment-preview')) return;
      placePreview(link, attachmentMeta, ++index);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAttachmentPreviews, {once: true});
  } else {
    initAttachmentPreviews();
  }
})();
