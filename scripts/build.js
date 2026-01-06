const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const packageRoot = path.resolve(__dirname, '..');
const distPublic = path.join(packageRoot, 'dist', 'public');

fs.mkdirSync(distPublic, {recursive: true});

const builds = [
  esbuild.build({
    entryPoints: [path.join(packageRoot, 'src', 'attachment-preview.js')],
    outfile: path.join(distPublic, 'attachment-preview.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2018'],
  }),
  esbuild.build({
    entryPoints: [path.join(packageRoot, 'src', 'attachment-preview.css')],
    outfile: path.join(distPublic, 'attachment-preview.min.css'),
    bundle: true,
    minify: true,
  }),
];

Promise.all(builds).catch((err) => {
  console.error(err);
  process.exit(1);
});
