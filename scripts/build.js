const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const packageRoot = path.resolve(__dirname, '..');
const distPublic = path.join(packageRoot, 'dist', 'public');
// BookStack's theme route sniffs the first 2 KB before allowing a script MIME type.
// Keep vendor syntax outside that sniff window so it is served as text/javascript.
const bookStackMimeGuard = `/* BookStack theme JavaScript MIME compatibility. ${' '.repeat(1980)}*/`;

fs.mkdirSync(distPublic, {recursive: true});

const builds = [
  {
    entryPoints: [path.join(packageRoot, 'src', 'attachment-preview.js')],
    outfile: path.join(distPublic, 'attachment-preview.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2018'],
  },
  {
    entryPoints: [path.join(packageRoot, 'src', 'attachment-preview.css')],
    outfile: path.join(distPublic, 'attachment-preview.min.css'),
    bundle: true,
    minify: true,
  },
  {
    entryPoints: [path.join(__dirname, 'docx-preview-entry.js')],
    outfile: path.join(distPublic, 'docx-preview.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2018'],
    banner: {js: bookStackMimeGuard},
  },
  {
    entryPoints: [path.join(__dirname, 'xlsx-preview-entry.js')],
    outfile: path.join(distPublic, 'xlsx-preview.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2018'],
    banner: {js: bookStackMimeGuard},
  },
];

Promise.all(builds.map((options) => esbuild.build(options))).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
