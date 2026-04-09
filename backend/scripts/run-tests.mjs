import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const distDir = path.resolve(process.cwd(), 'dist');

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return fullPath.endsWith('.test.js') ? [fullPath] : [];
    })
  );
  return files.flat();
};

const testFiles = (await walk(distDir)).sort((left, right) => left.localeCompare(right));

if (testFiles.length === 0) {
  throw new Error(`No compiled test files found in ${distDir}`);
}

for (const testFile of testFiles) {
  await import(pathToFileURL(testFile).href);
}
