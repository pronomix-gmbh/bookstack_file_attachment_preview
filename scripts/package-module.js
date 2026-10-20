const fs = require('node:fs');
const path = require('node:path');
const {pipeline} = require('node:stream/promises');
const yazl = require('yazl');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const distDir = path.join(projectRoot, 'dist');
const moduleRoot = path.join(distDir, 'bookstack-module');
const archivePath = path.join(distDir, 'file-attachment-preview.zip');

fs.rmSync(moduleRoot, {recursive: true, force: true});
fs.mkdirSync(moduleRoot, {recursive: true});

fs.writeFileSync(path.join(moduleRoot, 'bookstack-module.json'), `${JSON.stringify({
  name: 'file-attachment-preview',
  description: 'Responsive local previews for BookStack file attachments.',
  version: packageJson.version,
}, null, 2)}\n`);
fs.copyFileSync(path.join(projectRoot, 'module', 'functions.php'), path.join(moduleRoot, 'functions.php'));
fs.cpSync(path.join(projectRoot, 'module', 'views'), path.join(moduleRoot, 'views'), {recursive: true});
fs.cpSync(path.join(distDir, 'public'), path.join(moduleRoot, 'public'), {recursive: true});
fs.rmSync(archivePath, {force: true});

const zipFile = new yazl.ZipFile();
const addDirectory = (directory, archivePrefix = '') => {
  const entries = fs.readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    const archivePath = path.posix.join(archivePrefix, entry.name);
    if (entry.isDirectory()) addDirectory(filePath, archivePath);
    else zipFile.addFile(filePath, archivePath);
  }
};

const writeArchive = pipeline(zipFile.outputStream, fs.createWriteStream(archivePath));
addDirectory(moduleRoot);
zipFile.end();
writeArchive.then(() => {
  console.log(`Created BookStack theme module ${archivePath}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
