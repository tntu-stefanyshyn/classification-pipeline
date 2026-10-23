import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function cleanGeneratedDirectories(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = path.join(directory, entry.name);
    if (entry.name === 'generated') {
      await rm(child, { recursive: true, force: true });
    } else {
      await cleanGeneratedDirectories(child);
    }
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await cleanGeneratedDirectories(fileURLToPath(new URL('../src', import.meta.url)));
}
