# File Attachment Preview (BookStack)

Adds inline previews for attachment links in BookStack pages. The original link is moved into the preview header and
removed from the page body.

## Features
- PDF: inline preview in a resizable container.
- DOCX: inline preview using docx-preview (JSZip required).
- XLSX/XLS: inline preview using SheetJS (first sheet only, partial formatting).
- Images, audio, and video: native HTML elements.
- Download button with icon.

## Installation (BookStack)
1. From this folder, run: `npm run install-assets` (builds minified CSS/JS).
2. Copy `dist/public` into your theme folder, for example: `themes/px/public`.
3. Copy `dist/layouts/parts/custom-head.blade.php` into your theme views:
   - BookStack 24.x+: `themes/px/views/layouts/parts/custom-head.blade.php`
   - Older setups: `themes/px/layouts/parts/custom-head.blade.php`
4. Clear view cache if needed: `php artisan view:clear`.

## Notes
- `jszip`, `docx-preview`, and `xlsx` are loaded from jsdelivr CDN; only the preview CSS/JS is shipped with the theme.
- DOC (legacy) is not supported. Convert to DOCX or PDF.
- XLS formatting is partial; it uses `sheet_to_html`.
- The preview relies on attachment links (`/attachments/{id}`) in page content.

## Files
- `custom-head.blade.php`: Theme override that loads preview assets.
- `src/attachment-preview.js`: Source for preview behavior (bundled + minified).
- `src/attachment-preview.css`: Source for preview styles (minified).
- `dist/`: Output folder that matches the theme structure (`public/` and `layouts/parts/`).
- `scripts/install-assets.js`: Installs the custom head in `dist/layouts/parts`.
- `scripts/build.js`: Builds minified preview assets into `dist/public`.

## Author
- Dirk Drutschmann (pronomiX GmbH)
- Email: support@pronomix.de
- Website: https://pronomix.de

## License
Feel free to contribute.
