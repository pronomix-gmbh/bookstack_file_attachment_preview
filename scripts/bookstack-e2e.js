const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {Document, Paragraph, TextRun, Packer} = require('docx');
const {chromium} = require('playwright');
const XLSX = require('xlsx');

const projectRoot = path.resolve(__dirname, '..');
const composeFile = path.join(projectRoot, 'docker-compose.test.yml');
const moduleZip = path.join(projectRoot, 'dist', 'file-attachment-preview.zip');
const baseUrl = process.env.BOOKSTACK_URL || `http://localhost:${process.env.BOOKSTACK_PORT || '6875'}`;
const tokenId = 'a'.repeat(32);
const tokenSecret = 'b'.repeat(32);
const authorization = `Token ${tokenId}:${tokenSecret}`;
const pageTitle = `Attachment preview smoke test ${new Date().toISOString()}`;

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  ...options,
});

const crc32 = (input) => {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const checksumInput = Buffer.concat([typeBytes, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(checksumInput));
  return Buffer.concat([length, checksumInput, checksum]);
};

const makePng = () => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.from([0, 49, 92, 196, 255, 93, 143, 232, 255]);
  const zlib = require('node:zlib');
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const makePdf = () => {
  const stream = 'BT /F1 16 Tf 36 100 Td (BookStack attachment preview) Tj ET';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
};

const makeXlsx = () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['BookStack preview', 'Value'],
    ['Workbook rendered', 'Yes'],
    ['Cell content stays text', '<img src=x onerror=alert(1)>'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Preview');
  return XLSX.write(workbook, {bookType: 'xlsx', type: 'buffer'});
};

const provisionApiToken = () => {
  const php = `$user = \\BookStack\\Users\\Models\\User::query()->where('email', '=', 'admin@admin.com')->firstOrFail();
$tokenId = '${tokenId}';
$token = \\BookStack\\Api\\ApiToken::query()->where('token_id', '=', $tokenId)->first() ?: new \\BookStack\\Api\\ApiToken();
$token->forceFill(['name' => 'File attachment preview tests', 'token_id' => $tokenId, 'secret' => \\Illuminate\\Support\\Facades\\Hash::make('${tokenSecret}'), 'user_id' => $user->id, 'expires_at' => \\Illuminate\\Support\\Carbon::now()->addYears(2)->format('Y-m-d')])->save();
echo 'PREVIEW_TOKEN_READY';`;
  run('docker', ['compose', '-f', composeFile, 'exec', '-T', 'bookstack', 'php', '/app/www/artisan', 'tinker', `--execute=${php}`]);
};

const installThemeModule = () => {
  const containerId = execFileSync('docker', ['compose', '-f', composeFile, 'ps', '-q', 'bookstack'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
  if (!containerId) throw new Error('Could not find the local BookStack container to install the theme module');

  run('docker', ['exec', containerId, 'sh', '-lc', [
    'mkdir -p /config/www/themes/file-preview/modules',
    'rm -rf /config/www/themes/file-preview/modules/file-attachment-preview',
    'rm -rf /config/www/themes/file-preview/public',
    'rm -f /config/www/themes/file-preview/layouts/parts/custom-head.blade.php',
    'rm -f /config/www/themes/file-preview/views/layouts/parts/custom-head.blade.php',
  ].join(' && ')]);
  run('docker', ['cp', moduleZip, `${containerId}:/tmp/file-attachment-preview.zip`]);
  run('docker', ['compose', '-f', composeFile, 'exec', '-T', 'bookstack', 'php', '/app/www/artisan', 'bookstack:install-module', '/tmp/file-attachment-preview.zip'], {
    input: 'yes\n',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
};

const apiRequest = async (endpoint, options = {}) => {
  const response = await fetch(new URL(`/api${endpoint}`, baseUrl), {
    ...options,
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      ...(options.body instanceof FormData ? {} : {'Content-Type': 'application/json'}),
      ...options.headers,
    },
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`BookStack API ${options.method || 'GET'} ${endpoint} failed (${response.status}): ${responseText}`);
  }
  return responseText ? JSON.parse(responseText) : null;
};

const uploadAttachment = async (pageId, name, mimeType, content) => {
  const form = new FormData();
  form.append('name', name);
  form.append('uploaded_to', String(pageId));
  form.append('file', new Blob([content], {type: mimeType}), name);
  return apiRequest('/attachments', {method: 'POST', body: form});
};

const createTestBook = async () => {
  const book = await apiRequest('/books', {
    method: 'POST',
    body: JSON.stringify({name: pageTitle, description: 'Automatically generated browser test fixtures.'}),
  });
  const page = await apiRequest('/pages', {
    method: 'POST',
    body: JSON.stringify({book_id: book.id, name: 'Attachment previews', html: '<p>Preview fixtures are attached below.</p>'}),
  });

  const fixtures = [
    ['Preview.pdf', 'application/pdf', makePdf()],
    ['Preview.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', await Packer.toBuffer(new Document({
      sections: [{children: [
        new Paragraph({children: [new TextRun('BookStack DOCX preview check')]}),
        new Paragraph({children: [new TextRun('Locally bundled document renderer')]}),
      ]}],
    }))],
    ['Preview.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', makeXlsx()],
    ['Preview.png', 'image/png', makePng()],
    ['Preview.heic', 'image/heic', fs.readFileSync(path.join(projectRoot, 'tests', 'fixtures', 'preview.heic'))],
    ['Preview.tiff', 'image/tiff', fs.readFileSync(path.join(projectRoot, 'tests', 'fixtures', 'preview.tiff'))],
    ['Preview.txt', 'text/plain', Buffer.from('Fallback preview test file.', 'utf8')],
  ];

  const attachments = [];
  for (const [name, type, content] of fixtures) {
    attachments.push(await uploadAttachment(page.id, name, type, content));
  }

  const links = attachments.map((attachment) => `<p><a href="/attachments/${attachment.id}">${attachment.name}</a></p>`).join('\n');
  await apiRequest(`/pages/${page.id}`, {
    method: 'PUT',
    body: JSON.stringify({book_id: book.id, name: page.name, html: links}),
  });

  return {
    book,
    page,
    attachments,
    url: page.url || new URL(`/books/${book.slug}/page/${page.slug}`, baseUrl).toString(),
  };
};

const waitForBookStack = async () => {
  const loginUrl = new URL('/login', baseUrl);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const response = await fetch(loginUrl);
      if (response.ok) return;
    } catch (error) {
      // The app is still booting; retry until the bounded startup deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`BookStack did not become available at ${baseUrl} within 180 seconds`);
};

const assertBrowserPreviews = async (testBook) => {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1365, height: 960}});
  const previewRequests = [];
  const bundleMimeTypes = new Map();
  const browserErrors = [];
  page.on('request', (request) => {
    if (/\/(?:attachment-preview|docx-preview|xlsx-preview|tiff-preview|heic-preview(?:-worker)?)\.min\.js(?:\?|$)/.test(request.url())) {
      previewRequests.push(request.url());
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => browserErrors.push(`request: ${request.url()} (${request.failure()?.errorText || 'failed'})`));
  page.on('response', (response) => {
    const bundle = response.url().match(/\/(docx-preview|xlsx-preview|tiff-preview|heic-preview(?:-worker)?)\.min\.js(?:\?|$)/);
    if (bundle) bundleMimeTypes.set(bundle[1], response.headers()['content-type'] || '');
    if (response.status() >= 400) browserErrors.push(`response: ${response.status()} ${response.url()}`);
  });

  try {
    await page.goto(new URL('/login', baseUrl).toString(), {waitUntil: 'domcontentloaded'});
    await page.locator('input[name="email"]').fill('admin@admin.com');
    await page.locator('input[name="password"]').fill('password');
    await page.locator('#login-form button').click();
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), {timeout: 45_000});
    await page.goto(testBook.url, {waitUntil: 'domcontentloaded'});
    await page.locator('.page-content').waitFor({timeout: 30_000});

    if (await page.locator('head script[src*="attachment-preview.min.js"]').count() !== 1) {
      throw new Error('The installed BookStack theme module should inject exactly one local preview script');
    }

    const cards = page.locator('.attachment-preview');
    if (await cards.count() !== 7) {
      throw new Error(`Expected seven attachment previews, found ${await cards.count()}. Check that BookStack loaded the theme override.`);
    }
    const actionTextDecoration = await cards.first().locator('.attachment-preview__action').first().evaluate((link) => getComputedStyle(link).textDecorationLine);
    if (actionTextDecoration !== 'none') {
      throw new Error(`BookStack styles overrode the preview action styling: text-decoration=${actionTextDecoration}`);
    }
    await page.locator('html').evaluate((element) => element.classList.add('dark-mode'));
    const darkSurface = await cards.first().evaluate((card) => getComputedStyle(card).backgroundColor);
    await page.locator('html').evaluate((element) => element.classList.remove('dark-mode'));
    if (darkSurface !== 'rgb(23, 32, 51)') {
      throw new Error(`The preview cards should follow BookStack dark mode, got background ${darkSurface}`);
    }
    for (const filename of ['Preview.pdf', 'Preview.docx', 'Preview.xlsx', 'Preview.png', 'Preview.heic', 'Preview.tiff', 'Preview.txt']) {
      if (await page.getByRole('link', {name: filename}).count() === 0) {
        throw new Error(`The attachment preview page is missing ${filename}`);
      }
    }

    const pdfBody = cards.filter({hasText: 'Preview.pdf'}).locator('.attachment-preview__body');
    await pdfBody.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const object = document.querySelector('.attachment-preview__frame');
      return object && object.getAttribute('data') && object.getAttribute('data').includes('open=true');
    });

    const docxCard = cards.filter({hasText: 'Preview.docx'});
    await docxCard.locator('.attachment-preview__body').scrollIntoViewIfNeeded();
    await docxCard.locator('.attachment-preview__docx').getByText('BookStack DOCX preview check').waitFor({timeout: 60_000});

    const xlsxCard = cards.filter({hasText: 'Preview.xlsx'});
    await xlsxCard.locator('.attachment-preview__body').scrollIntoViewIfNeeded();
    await xlsxCard.locator('.attachment-preview__sheet td').getByText('Workbook rendered').waitFor({timeout: 60_000});
    if (await xlsxCard.locator('.attachment-preview__sheet img, .attachment-preview__sheet script').count() !== 0) {
      throw new Error('Spreadsheet cell data was interpreted as executable HTML');
    }

    const imageCard = cards.filter({hasText: 'Preview.png'});
    await imageCard.locator('.attachment-preview__body').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('.attachment-preview__image');
      return image && image.complete && image.naturalWidth === 2;
    }, null, {timeout: 30_000});

    const heicCard = cards.filter({hasText: 'Preview.heic'});
    await heicCard.locator('.attachment-preview__body').scrollIntoViewIfNeeded();
    try {
      await page.waitForFunction(() => {
        const card = [...document.querySelectorAll('.attachment-preview')].find((item) => item.textContent.includes('Preview.heic'));
        const image = card && card.querySelector('.attachment-preview__image');
        return image && image.complete && image.naturalWidth === 64;
      }, null, {timeout: 30_000});
    } catch (error) {
      console.error(`HEIC preview diagnostics: ${JSON.stringify(await heicCard.evaluate((card) => ({
        text: card.textContent,
        image: card.querySelector('.attachment-preview__image') && {
          src: card.querySelector('.attachment-preview__image').src,
          complete: card.querySelector('.attachment-preview__image').complete,
          width: card.querySelector('.attachment-preview__image').naturalWidth,
        },
      })))}`);
      throw error;
    }
    const heicColors = await heicCard.locator('.attachment-preview__image').evaluate((image) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return {
        top: [...pixels.slice(0, 3)],
        bottom: [...pixels.slice((canvas.height - 1) * canvas.width * 4, (canvas.height - 1) * canvas.width * 4 + 3)],
      };
    });
    if (heicColors.top.reduce((total, value, index) => total + Math.abs(value - heicColors.bottom[index]), 0) < 100) {
      throw new Error(`The HEIC pixels were not decoded correctly: ${JSON.stringify(heicColors)}`);
    }

    const tiffCard = cards.filter({hasText: 'Preview.tiff'});
    await tiffCard.locator('.attachment-preview__body').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.attachment-preview')].find((item) => item.textContent.includes('Preview.tiff'));
      const image = card && card.querySelector('.attachment-preview__image');
      return image && image.complete && image.naturalWidth === 2;
    }, null, {timeout: 60_000});

    const fallbackCard = cards.filter({hasText: 'Preview.txt'});
    if (!(await fallbackCard.locator('.attachment-preview__message--fallback').textContent()).includes('keine Vorschau verfügbar')) {
      throw new Error('Unsupported files should show an actionable fallback message');
    }

    const toggle = cards.first().locator('.attachment-preview__toggle');
    await toggle.focus();
    await page.keyboard.press('Enter');
    if (await toggle.getAttribute('aria-expanded') !== 'false') throw new Error('Keyboard toggle did not collapse the preview');
    await page.keyboard.press('Enter');
    if (await toggle.getAttribute('aria-expanded') !== 'true') throw new Error('Keyboard toggle did not expand the preview');

    const appOrigin = new URL(baseUrl).origin;
    const nonLocalRequests = previewRequests.filter((requestUrl) => new URL(requestUrl).origin !== appOrigin);
    if (nonLocalRequests.length) throw new Error(`Preview scripts loaded outside the BookStack host: ${nonLocalRequests.join(', ')}`);
    if (!previewRequests.some((requestUrl) => requestUrl.includes('docx-preview.min.js'))) throw new Error('The local DOCX bundle was not loaded');
    if (!previewRequests.some((requestUrl) => requestUrl.includes('xlsx-preview.min.js'))) throw new Error('The local XLSX bundle was not loaded');
    if (!previewRequests.some((requestUrl) => requestUrl.includes('tiff-preview.min.js'))) throw new Error('The local TIFF bundle was not loaded');
    if (!previewRequests.some((requestUrl) => requestUrl.includes('heic-preview.min.js'))) throw new Error('The local HEIC bundle was not loaded');
    if (!previewRequests.some((requestUrl) => requestUrl.includes('heic-preview-worker.min.js'))) throw new Error('The local HEIC worker was not loaded');
    const cspErrors = browserErrors.filter((error) => /content security policy|unsafe-eval|wasm/i.test(error));
    if (cspErrors.length) throw new Error(`The image preview triggered a content security policy error: ${cspErrors.join('; ')}`);
    for (const name of ['docx-preview', 'xlsx-preview', 'tiff-preview', 'heic-preview', 'heic-preview-worker']) {
      if (!bundleMimeTypes.get(name)?.startsWith('text/javascript')) {
        throw new Error(`${name} was served with an unsafe or unsupported MIME type: ${bundleMimeTypes.get(name) || 'missing response'}`);
      }
    }

    await page.setViewportSize({width: 390, height: 844});
    await page.locator('.attachment-preview').first().scrollIntoViewIfNeeded();
    const dimensions = await page.locator('.attachment-preview').first().evaluate((card) => ({
      card: card.getBoundingClientRect().width,
      header: card.querySelector('.attachment-preview__header').getBoundingClientRect().width,
      actions: card.querySelector('.attachment-preview__actions').getBoundingClientRect().width,
    }));
    if (dimensions.actions > dimensions.header || dimensions.header > dimensions.card) {
      throw new Error(`Attachment preview controls overflow on mobile: ${JSON.stringify(dimensions)}`);
    }

    console.log(`BookStack browser checks passed for ${testBook.url}`);
    console.log(`Preview script requests: ${previewRequests.join(', ')}`);
    console.log(`Vendor bundle MIME types: ${[...bundleMimeTypes].map(([name, mime]) => `${name}=${mime}`).join(', ')}`);
  } catch (error) {
    console.error(`Browser diagnostics for ${page.url()}: ${browserErrors.join('\n') || 'no browser errors recorded'}`);
    console.error(`Preview script requests observed: ${previewRequests.join(', ') || 'none'}`);
    throw error;
  } finally {
    await browser.close();
  }
};

const main = async () => {
  run('docker', ['compose', '-f', composeFile, 'up', '-d', '--wait', '--wait-timeout', '300']);
  await waitForBookStack();
  installThemeModule();
  provisionApiToken();
  const testBook = await createTestBook();
  console.log(`Created BookStack test book: ${testBook.book.name}`);
  await assertBrowserPreviews(testBook);
  console.log(`BookStack remains available at ${baseUrl} for manual review.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
