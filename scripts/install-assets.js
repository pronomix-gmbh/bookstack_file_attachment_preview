const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const distDir = path.join(packageRoot, 'dist');
const publicDir = path.join(distDir, 'public');
fs.mkdirSync(publicDir, {recursive: true});

console.log('Using CDN for jszip/docx-preview/xlsx; no vendor assets copied.');

const customHeadSrc = path.join(packageRoot, 'custom-head.blade.php');
const customHeadDest = path.join(distDir, 'layouts', 'parts', 'custom-head.blade.php');
fs.mkdirSync(path.dirname(customHeadDest), {recursive: true});
fs.copyFileSync(customHeadSrc, customHeadDest);
console.log(`Copied ${customHeadSrc} -> ${customHeadDest}`);
