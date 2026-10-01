import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { getIsMobile } from '../src/components/layout/AuthLayout/utils/getIsMobile';

const setWindow = (t: TestContext, value?: { innerWidth: number }) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  if (value !== undefined) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value,
    });
  } else {
    delete (globalThis as typeof globalThis & { window?: unknown }).window;
  }

  t.after(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'window', descriptor);
      return;
    }
    delete (globalThis as typeof globalThis & { window?: unknown }).window;
  });
};

test('getIsMobile returns true when window is unavailable', (t) => {
  setWindow(t);
  assert.equal(getIsMobile(), true);
});

test('getIsMobile returns true below the mobile breakpoint', (t) => {
  setWindow(t, { innerWidth: 959 });
  assert.equal(getIsMobile(), true);
});

test('getIsMobile returns false at desktop widths', (t) => {
  setWindow(t, { innerWidth: 960 });
  assert.equal(getIsMobile(), false);
});
