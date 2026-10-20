# File Attachment Preview for BookStack

Adds responsive inline previews for file attachments on BookStack pages. It supports PDF, DOCX, XLSX/XLS, common web and camera image formats, audio, and video. HEIC/HEIF images are decoded locally; TIFF files use a local fallback decoder when the browser cannot display them. Unsupported files remain accessible through open and download actions.

## Features

- Responsive preview cards with keyboard-accessible collapse controls.
- Styles follow BookStack's light and dark modes and adapt to mobile screens.
- Local PDF, DOCX, spreadsheet, HEIC/HEIF, and TIFF previews; no third-party CDN requests at runtime.
- DOCX, spreadsheet, TIFF, and HEIC decoder assets load only when their preview approaches the viewport or the browser cannot display a TIFF.
- Images, PDF files, audio, and video load on demand.
- Document, spreadsheet, HEIC/HEIF, and TIFF previews stop at 25 MB. Spreadsheet previews parse only the first sheet and show up to 100 rows and 20 columns; converted image decoding is capped at 20 megapixels.
- Native browser image formats include PNG, JPEG, GIF/APNG, WebP, AVIF, SVG, BMP, and ICO. JPEG XL and some TIFF based camera files depend on browser/embedded preview support.
- The HEIC decoder supports 8-bit HEVC 4:2:0 still images. Animated HEIF and less common HDR/10-bit profiles remain available through the original open/download actions.
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

## Install with Composer

For BookStack 26.03 and newer, the package can be installed through Packagist and then handed to BookStack's own module installer:

```sh
composer require pronomix-gmbh/bookstack-file-attachment-preview
vendor/bin/bookstack-file-preview install
```

Run the command from the BookStack application directory. The installer selects the GitHub release asset matching the installed Composer package version and invokes `php artisan bookstack:install-module`. BookStack handles the module placement and any confirmation needed to replace an existing module. Composer itself does not automatically run scripts declared by dependency packages, so the explicit install command is required after `composer require`.

The BookStack path and module source can be overridden when needed:

```sh
vendor/bin/bookstack-file-preview install --bookstack=/srv/bookstack --zip=/tmp/file-attachment-preview.zip
vendor/bin/bookstack-file-preview install --bookstack=/srv/bookstack --url=https://example.com/file-attachment-preview.zip
```

The Packagist listing must be registered once at <https://packagist.org/packages/submit> using this repository URL: <https://github.com/pronomix-gmbh/bookstack_file_attachment_preview>. The GitHub Actions tag workflow publishes the matching module ZIP as a GitHub release asset, which the Composer installer uses.

The classic theme view override is an advanced customization point. BookStack documents these overrides as unstable, so the CI browser test tracks the current release and helps catch changes.

## Development and tests

Run the DOM and behavior tests and build locally with:

```sh
npm ci --ignore-scripts
npm test
npm run build
```

For a real BookStack browser test, install Docker and the Playwright Chromium browser once:

```sh
npx playwright install chromium
npm run test:bookstack
```

This starts a disposable BookStack and MariaDB stack using the latest BookStack image, installs the Composer package in a temporary Composer project, runs its installer against BookStack, creates a test book and attachments through BookStack's API, and checks the plugin in Chromium. The browser checks cover PDF, DOCX, XLSX, PNG, HEIC, TIFF, and fallback behavior, including CSP, theme modes, and mobile layout. It leaves the stack running at <http://localhost:6875> for manual review. The test admin login is `admin@admin.com` / `password`.

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
- `@stacksjs/ts-heic` is bundled for local HEIC/HEIF decoding. Its pure TypeScript decoder runs in a separate local worker without `eval` or WebAssembly, so it works with BookStack's default content security policy and keeps large decodes off the UI thread. The converter is used for viewing only; the original attachment and its metadata remain unchanged.
- `utif2` is bundled for TIFF fallback rendering. Its small bundle is loaded only when a browser cannot display a TIFF directly.
- SheetJS Community Edition 0.20.3 is installed from its official package tarball and bundled locally.
- `THIRD-PARTY-NOTICES.md` and the bundled decoder license texts are included in the module ZIP.
- `jsdom`, `docx`, and Playwright support unit and browser tests.

## Source and generated files

- `src/attachment-preview.js`: preview detection, rendering, and lazy loading.
- `src/attachment-preview.css`: responsive preview card styles.
- `custom-head.blade.php`: BookStack theme asset includes.
- `scripts/build.js`: builds the core and lazy-loaded DOCX, XLSX, TIFF, and HEIC assets into `dist/public`.
- `module/`: BookStack theme module entry point and current-version head view.
- `scripts/package-module.js`: creates `dist/file-attachment-preview.zip` for the BookStack module installer.
- `bin/bookstack-file-preview`: Composer binary that calls BookStack's native module installer.
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
