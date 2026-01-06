(() => {
  const initAttachmentPreviews = () => {
    const pageContent = document.querySelector('.page-content');
    if (!pageContent) return;

    const attachmentIdFromHref = (href) => {
      try {
        const url = new URL(href, window.location.origin);
        const match = url.pathname.match(/\/attachments\/(\d+)/);
        return match ? match[1] : null;
      } catch (err) {
        return null;
      }
    };

    const inlineUrl = (href) => {
      try {
        const url = new URL(href, window.location.origin);
        url.searchParams.set('open', 'true');
        return url.toString();
      } catch (err) {
        return href.includes('?') ? `${href}&open=true` : `${href}?open=true`;
      }
    };

    const extensionFromName = (name = '') => {
      const clean = name.trim();
      const lastDot = clean.lastIndexOf('.');
      if (lastDot === -1) return '';
      return clean.slice(lastDot + 1).toLowerCase();
    };

    const attachmentMeta = {};
    const attachmentIds = new Set();
    document.querySelectorAll('#page-attachments .attachment a[href*="/attachments/"]').forEach((link) => {
      const id = attachmentIdFromHref(link.getAttribute('href'));
      if (!id) return;
      attachmentIds.add(id);
      if (attachmentMeta[id]) return;
      const label = link.querySelector('.label');
      const name = (label ? label.textContent : link.textContent).trim();
      attachmentMeta[id] = {
        name,
        ext: extensionFromName(name),
      };
    });

    const imageExt = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
    const videoExt = new Set(['mp4', 'webm', 'mkv', 'ogg', 'avi']);
    const audioExt = new Set(['mp3', 'ogg', 'wav', 'flac', 'aac']);
    const docxExt = new Set(['docx']);
    const sheetExt = new Set(['xlsx', 'xls']);

    const previewIconMarkup = `
      <span class="attachment-preview__file-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
          <path fill="currentColor" d="M6 2h8l4 4v16H6z"/>
          <path fill="currentColor" opacity="0.35" d="M14 2v6h6z"/>
        </svg>
      </span>
    `;

    const downloadIconMarkup = `
      <span class="attachment-preview__download-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">
          <path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v8.17l2.59-2.58a1 1 0 1 1 1.41 1.41l-4.3 4.29a1 1 0 0 1-1.4 0l-4.3-4.29a1 1 0 1 1 1.41-1.41L11 12.17V4a1 1 0 0 1 1-1z"/>
          <path fill="currentColor" d="M5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1z"/>
        </svg>
      </span>
    `;

    const renderDocxPreview = async (url, container) => {
      if (!window.docx || !window.JSZip) {
        container.innerHTML = '<div class="attachment-preview__fallback">DOCX-Vorschau nicht verfügbar.</div>';
        return;
      }

      try {
        const response = await fetch(url, {credentials: 'same-origin'});
        if (!response.ok) {
          throw new Error('docx fetch failed');
        }
        const blob = await response.blob();
        await window.docx.renderAsync(blob, container, container, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        });
      } catch (err) {
        container.innerHTML = '<div class="attachment-preview__fallback">DOCX-Vorschau nicht verfügbar.</div>';
      }
    };

    const renderSheetPreview = async (url, container) => {
      if (!window.XLSX) {
        container.innerHTML = '<div class="attachment-preview__fallback">Excel-Vorschau nicht verfügbar.</div>';
        return;
      }

      try {
        const response = await fetch(url, {credentials: 'same-origin'});
        if (!response.ok) {
          throw new Error('xlsx fetch failed');
        }
        const buffer = await response.arrayBuffer();
        const workbook = window.XLSX.read(buffer, {type: 'array'});
        const sheetName = workbook.SheetNames[0];
        const sheet = sheetName ? workbook.Sheets[sheetName] : null;
        if (!sheet) {
          throw new Error('missing sheet');
        }

        const html = window.XLSX.utils.sheet_to_html(sheet, {
          id: 'attachment-preview-sheet',
          editable: false,
        });

        container.classList.add('attachment-preview__sheet');
        container.innerHTML = html;
      } catch (err) {
        container.innerHTML = '<div class="attachment-preview__fallback">Excel-Vorschau nicht verfügbar.</div>';
      }
    };

    const placePreview = (link) => {
      if (link.dataset.attachmentPreview === 'true') return;

      const attachmentId = attachmentIdFromHref(link.getAttribute('href'));
      if (!attachmentId) return;
      if (!attachmentIds.has(attachmentId)) return;

      const originalAnchor = link.cloneNode(true);
      originalAnchor.classList.add('attachment-preview__title-link');

      link.dataset.attachmentPreview = 'true';

      const meta = attachmentMeta[attachmentId] || {};
      const originalText = link.textContent.trim();
      const name = meta.name || originalText || `Anhang ${attachmentId}`;
      const ext = (meta.ext || extensionFromName(name)).toLowerCase();
      const previewUrl = inlineUrl(link.href);

      const paragraph = link.closest('p');
      const heading = link.closest('h1, h2, h3, h4, h5, h6');
      const listItem = link.closest('li');

      const wrapper = document.createElement('div');
      wrapper.className = 'attachment-preview';
      wrapper.dataset.attachmentId = attachmentId;

      const header = document.createElement('div');
      header.className = 'attachment-preview__header';

      const title = document.createElement('span');
      title.className = 'attachment-preview__title';
      title.appendChild(originalAnchor);
      header.innerHTML = previewIconMarkup;
      header.appendChild(title);

      if (ext) {
        const badge = document.createElement('span');
        badge.className = 'attachment-preview__badge';
        badge.textContent = ext.toUpperCase();
        header.appendChild(badge);
      }

      const actions = document.createElement('div');
      actions.className = 'attachment-preview__actions';

      const downloadLink = document.createElement('a');
      downloadLink.href = link.href;
      downloadLink.innerHTML = `${downloadIconMarkup}<span>Herunterladen</span>`;
      downloadLink.setAttribute('download', '');
      actions.appendChild(downloadLink);

      header.appendChild(actions);
      wrapper.appendChild(header);

      const body = document.createElement('div');
      body.className = 'attachment-preview__body';

      if (ext === 'pdf') {
        const object = document.createElement('object');
        object.className = 'attachment-preview__frame';
        object.data = previewUrl;
        object.type = 'application/pdf';
        object.setAttribute('aria-label', `Vorschau von ${name}`);

        const fallback = document.createElement('div');
        fallback.className = 'attachment-preview__fallback';
        fallback.innerHTML = '<span>PDF-Vorschau nicht verfügbar. Bitte oben öffnen oder herunterladen.</span>';
        object.appendChild(fallback);

        const resizable = document.createElement('div');
        resizable.className = 'attachment-preview__resizable';
        resizable.appendChild(object);
        body.appendChild(resizable);
      } else if (docxExt.has(ext)) {
        const resizable = document.createElement('div');
        resizable.className = 'attachment-preview__resizable attachment-preview__resizable--auto';

        const docxContainer = document.createElement('div');
        resizable.appendChild(docxContainer);
        body.appendChild(resizable);

        renderDocxPreview(previewUrl, docxContainer);
      } else if (sheetExt.has(ext)) {
        const resizable = document.createElement('div');
        resizable.className = 'attachment-preview__resizable attachment-preview__resizable--auto';

        const sheetContainer = document.createElement('div');
        resizable.appendChild(sheetContainer);
        body.appendChild(resizable);

        renderSheetPreview(previewUrl, sheetContainer);
      } else if (imageExt.has(ext)) {
        const img = document.createElement('img');
        img.className = 'attachment-preview__image';
        img.src = previewUrl;
        img.alt = name;
        img.loading = 'lazy';
        body.appendChild(img);
      } else if (videoExt.has(ext)) {
        const video = document.createElement('video');
        video.className = 'attachment-preview__media';
        video.controls = true;
        video.src = previewUrl;
        body.appendChild(video);
      } else if (audioExt.has(ext)) {
        const audio = document.createElement('audio');
        audio.className = 'attachment-preview__media';
        audio.controls = true;
        audio.src = previewUrl;
        body.appendChild(audio);
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'attachment-preview__fallback';
        fallback.innerHTML = '<span>Keine Vorschau verfügbar. Bitte oben öffnen oder herunterladen.</span>';
        body.appendChild(fallback);
      }

      wrapper.appendChild(body);

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

    pageContent.querySelectorAll('a[href*="/attachments/"]').forEach(placePreview);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAttachmentPreviews);
  } else {
    initAttachmentPreviews();
  }
})();
