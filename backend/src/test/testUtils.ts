import 'reflect-metadata';
import type { TestContext } from 'node:test';

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

export const createExecResult = <T>(value?: T) => ({
  exec: async () => value,
});

export const createLeanResult = <T>(value: T) => ({
  lean: async () => value,
});
