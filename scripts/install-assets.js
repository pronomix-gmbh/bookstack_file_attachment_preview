const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const distDir = path.join(packageRoot, 'dist');
const publicDir = path.join(distDir, 'public');
fs.mkdirSync(publicDir, {recursive: true});

console.log('Bundled preview libraries are available in dist/public.');

const customHeadSrc = path.join(packageRoot, 'custom-head.blade.php');
for (const themeViewPath of ['layouts/parts/custom-head.blade.php', 'views/layouts/parts/custom-head.blade.php']) {
  const customHeadDest = path.join(distDir, themeViewPath);
  fs.mkdirSync(path.dirname(customHeadDest), {recursive: true});
  fs.copyFileSync(customHeadSrc, customHeadDest);
  console.log(`Copied ${customHeadSrc} -> ${customHeadDest}`);
}
