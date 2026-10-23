import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { cleanGeneratedDirectories } from './clean-codegen.mjs';

test('cleanup removes nested generated directories and preserves handwritten files', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codegen-clean-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'feature/graphql/generated'), { recursive: true });
  await mkdir(path.join(root, 'generated'), { recursive: true });
  await writeFile(path.join(root, 'feature/graphql/generated/query.ts'), 'generated query');
  await writeFile(path.join(root, 'generated/types.ts'), 'generated types');
  await writeFile(path.join(root, 'feature/source.ts'), 'handwritten source');
  await writeFile(path.join(root, 'generated.ts'), 'a source file, not a directory');

  await cleanGeneratedDirectories(root);
  await cleanGeneratedDirectories(root);

  await assert.rejects(access(path.join(root, 'generated')), { code: 'ENOENT' });
  await assert.rejects(access(path.join(root, 'feature/graphql/generated')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(root, 'feature/source.ts'), 'utf8'), 'handwritten source');
  assert.equal(
    await readFile(path.join(root, 'generated.ts'), 'utf8'),
    'a source file, not a directory'
  );
});

test('cleanup does not follow directory symlinks outside the source tree', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codegen-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'src');
  const external = path.join(root, 'external');
  await mkdir(source);
  await mkdir(path.join(external, 'generated'), { recursive: true });
  await writeFile(path.join(external, 'generated/keep.ts'), 'external source');
  await symlink(external, path.join(source, 'linked'), 'junction');

  await cleanGeneratedDirectories(source);

  assert.equal(await readFile(path.join(external, 'generated/keep.ts'), 'utf8'), 'external source');
});
