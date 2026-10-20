const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const installer = path.join(projectRoot, 'bin', 'bookstack-file-preview');
const php = process.env.PHP_BINARY || 'php';

const createBookStackFixture = (t, {supportsModules = true, installedVersion = null} = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bookstack-preview-composer-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'vendor'), {recursive: true});
  fs.writeFileSync(path.join(root, 'artisan'), `<?php
if (($argv[1] ?? '') === 'list') {
    echo ${supportsModules ? "'bookstack:install-module  Install a theme module\\n'" : "'bookstack:install-theme  Install a theme\\n'"};
    exit(0);
}
file_put_contents(__DIR__ . '/install-arguments.json', json_encode(array_slice($argv, 1)));
exit((int) (getenv('BOOKSTACK_PREVIEW_FAKE_EXIT') ?: 0));
`);

  if (installedVersion) {
    fs.writeFileSync(path.join(root, 'vendor', 'autoload.php'), `<?php
namespace Composer;
final class InstalledVersions {
    public static function getPrettyVersion(string $packageName): ?string {
        return $packageName === 'pronomix-gmbh/bookstack-file-attachment-preview' ? '${installedVersion}' : null;
    }
}
`);
  }

  return root;
};

const runInstaller = (args, cwd) => spawnSync(php, [installer, ...args], {
  cwd,
  encoding: 'utf8',
});

test('forwards a local module ZIP to the native BookStack module installer', (t) => {
  const root = createBookStackFixture(t);
  const zip = path.join(root, 'module.zip');
  fs.writeFileSync(zip, 'fixture');

  const result = runInstaller(['install', `--bookstack=${root}`, `--zip=${zip}`], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'install-arguments.json'), 'utf8')), [
    'bookstack:install-module',
    fs.realpathSync(zip),
  ]);
});

test('uses the matching versioned GitHub release asset by default', (t) => {
  const root = createBookStackFixture(t, {installedVersion: 'v1.3.0'});

  const result = runInstaller(['install'], root);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'install-arguments.json'), 'utf8')), [
    'bookstack:install-module',
    'https://github.com/pronomix-gmbh/bookstack_file_attachment_preview/releases/download/v1.3.0/file-attachment-preview.zip',
  ]);
});

test('passes through a supplied module URL', (t) => {
  const root = createBookStackFixture(t);
  const url = 'https://downloads.example.test/file-attachment-preview.zip';

  const result = runInstaller(['install', `--bookstack=${root}`, `--url=${url}`], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'install-arguments.json'), 'utf8')), [
    'bookstack:install-module',
    url,
  ]);
});

test('rejects BookStack versions without native theme-module support', (t) => {
  const root = createBookStackFixture(t, {supportsModules: false});

  const result = runInstaller(['install', `--bookstack=${root}`, '--url=https://example.test/module.zip'], projectRoot);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /require BookStack 26\.03 or newer/);
  assert.equal(fs.existsSync(path.join(root, 'install-arguments.json')), false);
});

test('works as a Composer-installed vendor binary', (t) => {
  const root = createBookStackFixture(t);
  fs.writeFileSync(path.join(root, 'composer.json'), JSON.stringify({
    name: 'test/bookstack-installation',
    repositories: [{
      type: 'path',
      url: projectRoot,
      options: {
        symlink: true,
        versions: {'pronomix-gmbh/bookstack-file-attachment-preview': '1.3.0'},
      },
    }],
    require: {'pronomix-gmbh/bookstack-file-attachment-preview': '1.3.0'},
  }, null, 2));

  const install = spawnSync('composer', [
    'install',
    '--no-interaction',
    '--no-progress',
    '--working-dir',
    root,
  ], {encoding: 'utf8'});
  assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

  const result = spawnSync(php, [path.join(root, 'vendor', 'bin', 'bookstack-file-preview'), 'install'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'install-arguments.json'), 'utf8')), [
    'bookstack:install-module',
    'https://github.com/pronomix-gmbh/bookstack_file_attachment_preview/releases/download/v1.3.0/file-attachment-preview.zip',
  ]);
});
