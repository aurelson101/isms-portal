import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep, join } from 'node:path';
import glob from 'glob';
import archiver from 'archiver';
import { unzipSync, strFromU8 } from 'fflate';
import qs from 'qs';

test('patched matching dependencies preserve glob and ZIP behavior', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isms-archive-check-'));
  try {
    await mkdir(join(directory, 'nested'));
    await writeFile(join(directory, 'policy.txt'), 'policy');
    await writeFile(join(directory, 'nested', 'guide.txt'), 'guide');
    await writeFile(join(directory, 'nested', 'excluded.txt'), 'excluded');
    const options = { cwd: directory, ignore: '**/excluded.txt', nodir: true };
    assert.deepEqual(glob.sync('**/*.txt', options).sort(), ['nested/guide.txt', 'policy.txt']);
    const asynchronous = await new Promise((resolve, reject) => glob('**/*.txt', options, (error, files) => error ? reject(error) : resolve(files)));
    assert.deepEqual(asynchronous.sort(), ['nested/guide.txt', 'policy.txt']);
    const archive = archiver('zip', { store: true });
    const chunks = [];
    const completed = new Promise((resolve, reject) => {
      archive.on('data', chunk => chunks.push(chunk));
      archive.on('error', reject);
      archive.on('warning', reject);
      archive.on('end', resolve);
    });
    archive.glob('**/*.txt', options);
    await archive.finalize();
    await completed;
    const files = unzipSync(Buffer.concat(chunks));
    assert.deepEqual(Object.keys(files).sort(), ['nested/guide.txt', 'policy.txt']);
    assert.equal(strFromU8(files['nested/guide.txt']), 'guide');
  } finally {
    const target = resolve(directory);
    assert(target.startsWith(resolve(tmpdir()) + sep) && target.includes('isms-archive-check-'));
    await rm(target, { recursive: true, force: true });
  }
});

test('query serialization tolerates an uncallable own toString', () => {
  assert.doesNotThrow(() => qs.stringify({ a: [{ toString: 'x' }] }, { arrayFormat: 'comma' }));
  assert.equal(qs.stringify({ a: ['one', 'two'] }, { arrayFormat: 'comma' }), 'a=one%2Ctwo');
});
