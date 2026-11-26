import 'reflect-metadata';
import type { TestContext } from 'node:test';

type MutableRecord = Record<PropertyKey, unknown>;

// The property as it was before the first stub of it that is still active. A second stub of the
// same property in one test must restore this, not the first stub: otherwise the first stub is put
// back for good and leaks into every later test, because all tests share one process.
const originals = new WeakMap<object, Map<PropertyKey, PropertyDescriptor | undefined>>();

export const stub = <T extends MutableRecord, K extends keyof T>(
  t: TestContext,
  target: T,
  key: K,
  replacement: T[K]
) => {
  const saved = originals.get(target) ?? new Map<PropertyKey, PropertyDescriptor | undefined>();
  originals.set(target, saved);
  if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(target, key));
  const descriptor = saved.get(key);
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: replacement,
  });
  t.after(() => {
    saved.delete(key);
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
      return;
    }
    delete target[key];
  });
  return replacement;
};

export const createExecResult = <T>(value?: T) => ({
  exec: async () => value,
});

export const createLeanResult = <T>(value: T) => ({
  lean: async () => value,
});
