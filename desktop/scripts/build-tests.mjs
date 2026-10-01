import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const cwd = process.cwd();
const outdir = path.resolve(cwd, '.test-dist');
const entryRoots = ['src', 'tests'];

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return /\.(ts|tsx)$/.test(entry.name) ? [path.relative(cwd, fullPath)] : [];
    })
  );
  return files.flat();
};

const collectEntryPoints = async () => {
  const groups = await Promise.all(entryRoots.map((root) => walk(path.resolve(cwd, root))));
  return groups.flat().sort((left, right) => left.localeCompare(right));
};

await rm(outdir, { recursive: true, force: true });

const entryPoints = await collectEntryPoints();

if (entryPoints.length === 0) {
  throw new Error('No test or source entry points found for desktop test build');
}

await build({
  absWorkingDir: cwd,
  bundle: false,
  entryPoints,
  format: 'cjs',
  logLevel: 'silent',
  outbase: '.',
  outdir,
  packages: 'external',
  platform: 'node',
  sourcemap: false,
  target: 'node20',
});
