import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stub } from './testUtils';

class Model {
  static create() {
    return 'real';
  }
}

test('stubbing a property twice in one test restores the original, not the first stub', async (t) => {
  await t.test('two stubs of an inherited static', (inner) => {
    class Child extends Model {}
    stub(inner, Child as any, 'create', () => 'first');
    stub(inner, Child as any, 'create', () => 'second');
    assert.equal((Child as any).create(), 'second');
    (globalThis as any).__child = Child;
  });

  assert.equal((globalThis as any).__child.create(), 'real');
  delete (globalThis as any).__child;
});

test('a stub is restored after its test, and stubbing it again later works', async (t) => {
  const target: Record<string, unknown> = { value: 'original' };
  await t.test('first test', (inner) => {
    stub(inner, target, 'value', 'stubbed');
  });
  assert.equal(target.value, 'original');

  await t.test('second test', (inner) => {
    stub(inner, target, 'value', 'stubbed again');
    assert.equal(target.value, 'stubbed again');
  });
  assert.equal(target.value, 'original');
});
