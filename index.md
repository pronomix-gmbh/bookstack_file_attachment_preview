+++ 
title = "File Attachment Preview"
author = "Dirk Drutschmann"
company = "pronomiX GmbH"
date = 2025-02-14T00:00:00Z
updated = 2025-02-14T00:00:00Z
tested = "v24.12"
+++

This hack adds attachment previews to BookStack page content when a link points to an attachment. The original anchor
is moved into the preview header, and the inline link is removed from the page body.

What it does
- PDF: inline preview in a resizable container.
- DOCX: inline preview using docx-preview (JSZip required).
- XLSX/XLS: inline preview using SheetJS (first sheet only, partial formatting).
- Images, audio, and video: native HTML elements.
- Download button with icon.

Installation
1. From this folder: `npm run install-assets` (builds minified CSS/JS)
2. Copy `dist` into your theme, for example: `themes/px/file-attachment-preview`
3. Clear view cache if needed: `php artisan view:clear`

Files
- `custom-head.blade.php`: Theme override that loads preview assets.
- `src/attachment-preview.js`: Source for preview behavior (bundled + minified).
- `src/attachment-preview.css`: Source for preview styles (minified).
- `dist/`: Output folder that matches the theme structure (`public/` and `layouts/parts/`).
- `scripts/install-assets.js`: Installs the custom head in `dist/layouts/parts`.
- `scripts/build.js`: Builds minified preview assets into `dist/public`.
 
Dependencies
- `jszip`, `docx-preview`, and `xlsx` are loaded from jsdelivr CDN; only the preview CSS/JS is shipped with the theme.

Considerations
- DOC (legacy) is not supported. Convert to DOCX or PDF.
- XLS formatting is partial; it uses `sheet_to_html`.
- The preview relies on attachment links (`/attachments/{id}`) in page content.

Code
{{custom-head.blade.php}}
