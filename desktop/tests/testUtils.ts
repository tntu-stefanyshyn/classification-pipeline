import type { TestContext } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

type MutableRecord = Record<PropertyKey, unknown>;

export const stub = <T extends MutableRecord, K extends keyof T>(
  t: TestContext,
  target: T,
  key: K,
  replacement: T[K]
) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: replacement,
  });
  t.after(() => {
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
      return;
    }
    delete target[key];
  });
  return replacement;
};

export const setEnv = (t: TestContext, key: string, value?: string) => {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  t.after(() => {
    if (previous === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = previous;
  });
};

export const loadFreshModule = <T>(modulePath: string): T => {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved) as T;
};

export const stubResolvedModule = (
  t: TestContext,
  fromFile: string,
  specifier: string,
  exports: unknown
) => {
  const resolver = Module.createRequire(fromFile);
  const resolved = resolver.resolve(specifier);
  const previous = require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
    children: [],
    paths: [],
    path: path.dirname(resolved),
    isPreloading: false,
    parent: module,
    require,
  } as NodeModule;
  t.after(() => {
    if (previous) {
      require.cache[resolved] = previous;
      return;
    }
    delete require.cache[resolved];
  });
  return resolved;
};

export const ignoreCssImports = (t: TestContext) => {
  const previous = require.extensions['.css'];
  require.extensions['.css'] = () => undefined;
  t.after(() => {
    if (previous) {
      require.extensions['.css'] = previous;
      return;
    }
    delete require.extensions['.css'];
  });
};

export const ensureFile = (filePath: string, content = '') => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
  }
};
