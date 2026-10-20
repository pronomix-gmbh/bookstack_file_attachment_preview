# File Attachment Preview for BookStack

Adds responsive inline previews for file attachments on BookStack pages. It supports PDF, DOCX, XLSX/XLS, images, audio, and video. Unsupported file types remain accessible through open and download actions.

## Features

- Responsive preview cards with keyboard-accessible collapse controls.
- Styles follow BookStack's light and dark modes and adapt to mobile screens.
- Local PDF, DOCX, and spreadsheet previews; no third-party CDN requests at runtime.
- DOCX and spreadsheet bundles load only when their preview approaches the viewport.
- Images, PDF files, audio, and video load on demand.
- DOCX and spreadsheet previews stop at 25 MB; spreadsheets parse only the first sheet and show up to 100 rows and 20 columns.
- File open and download actions remain available if a preview cannot be rendered.

## Install in BookStack

1. Install the locked npm dependencies and build the theme assets:

   ```sh
   npm run install-assets
   ```

2. Set `APP_THEME` to an active theme in BookStack.
3. On BookStack 26.03 and newer, install the generated module ZIP from the BookStack installation directory:

   ```sh
   php artisan bookstack:install-module /path/to/dist/file-attachment-preview.zip
   ```

   The module includes all browser assets and injects them through the module view system. No runtime CDN access is needed.
4. On older BookStack versions, copy `dist/public` into your theme's public folder, for example `themes/file-preview/public`. Copy `dist/layouts/parts/custom-head.blade.php` to `themes/file-preview/layouts/parts/custom-head.blade.php`; for releases using a `views` subdirectory, use the generated copy at `dist/views/layouts/parts/custom-head.blade.php`. Clear the view cache if needed with `php artisan view:clear`.

The classic theme view override is an advanced customization point. BookStack documents these overrides as unstable, so the CI browser test tracks the current release and helps catch changes.

## Development and tests

Run the DOM and behavior tests and build locally with:

```sh
npm ci
npm test
npm run build
```

For a real BookStack browser test, install Docker and the Playwright Chromium browser once:

```sh
npx playwright install chromium
npm run test:bookstack
```

This starts a disposable BookStack and MariaDB stack using the latest BookStack image, installs the generated ZIP with BookStack's module installer, creates a test book and attachments through BookStack's API, and checks the plugin in Chromium. It leaves the stack running at <http://localhost:6875> for manual review. The test admin login is `admin@admin.com` / `password`.

Stop the stack while keeping its local data:

```sh
docker compose -f docker-compose.test.yml down
```

GitHub Actions runs the unit tests and the same browser integration test against the latest BookStack image. It also uploads the installable module ZIP as a workflow artifact.

## Dependencies

- `esbuild` bundles the theme assets.
- `yazl` packages the compiled assets and module files into an installable ZIP.
- The DOCX and XLSX bundles include a small compatibility header because recent BookStack versions MIME-sniff theme files and reject vendor code classified as `application/javascript` or binary data.
- `docx-preview` and its JSZip dependency are bundled locally.
- SheetJS Community Edition 0.20.3 is installed from its official package tarball and bundled locally.
- `jsdom`, `docx`, and Playwright support unit and browser tests.

## Source and generated files

- `src/attachment-preview.js`: preview detection, rendering, and lazy loading.
- `src/attachment-preview.css`: responsive preview card styles.
- `custom-head.blade.php`: BookStack theme asset includes.
- `scripts/build.js`: builds the core, DOCX, and XLSX bundles into `dist/public`.
- `module/`: BookStack theme module entry point and current-version head view.
- `scripts/package-module.js`: creates `dist/file-attachment-preview.zip` for the BookStack module installer.
- `scripts/install-assets.js`: copies the custom head template to both supported theme view paths.
- `tests/attachment-preview.test.js`: DOM-level behavior tests.
- `scripts/bookstack-e2e.js`: local BookStack fixture creation and Playwright checks.
- `.github/workflows/ci.yml`: unit and latest-BookStack browser tests.

## Author

- Dirk Drutschmann (pronomiX GmbH)
- Email: support@pronomix.de
- Website: <https://pronomix.de>

## License

Feel free to contribute.
