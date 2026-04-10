import type { TestContext } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import React from 'react';

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

export const findElements = (
  node: unknown,
  predicate: (element: React.ReactElement) => boolean,
  results: React.ReactElement[] = []
): React.ReactElement[] => {
  if (Array.isArray(node)) {
    node.forEach((child) => findElements(child, predicate, results));
    return results;
  }

  if (!React.isValidElement(node)) {
    return results;
  }

  if (predicate(node)) {
    results.push(node);
  }

  findElements(node.props?.children, predicate, results);
  return results;
};

export const findElement = (node: unknown, predicate: (element: React.ReactElement) => boolean) =>
  findElements(node, predicate)[0] ?? null;

export const getElementName = (element: React.ReactElement | null) => {
  if (!element) return '';
  if (typeof element.type === 'string') return element.type;
  return (
    (element.type as { displayName?: string; name?: string }).displayName ??
    (element.type as { displayName?: string; name?: string }).name ??
    ''
  );
};

export const createUseStateStub = (seededValues: unknown[] = []) => {
  const values = [...seededValues];
  const calls: Array<{ index: number; value: unknown }> = [];
  let cursor = 0;

  const useState = <T>(initialState: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] => {
    const index = cursor;
    cursor += 1;

    if (!(index in values)) {
      values[index] =
        typeof initialState === 'function' ? (initialState as () => T)() : initialState;
    }

    const setState = (next: T | ((prev: T) => T)) => {
      const previous = values[index] as T;
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(previous) : next;
      values[index] = resolved;
      calls.push({ index, value: resolved });
    };

    return [values[index] as T, setState];
  };

  const reset = () => {
    cursor = 0;
  };

  return { useState, values, calls, reset };
};
