import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCsvFile, isCsvFilename } from '../src/utils/fileValidation';

test('fileValidation accepts csv filenames regardless of case and whitespace', () => {
  assert.equal(isCsvFilename(' report.csv '), true);
  assert.equal(isCsvFilename('REPORT.CSV'), true);
  assert.equal(isCsvFilename('report.txt'), false);
});

test('fileValidation accepts supported csv mime types and empty browser mime type', () => {
  assert.equal(isCsvFile({ name: 'report.csv', type: 'text/csv' } as File), true);
  assert.equal(isCsvFile({ name: 'report.csv', type: 'application/vnd.ms-excel' } as File), true);
  assert.equal(isCsvFile({ name: 'report.csv', type: '' } as File), true);
});

test('fileValidation rejects non-csv filename or unsupported mime type', () => {
  assert.equal(isCsvFile({ name: 'report.txt', type: 'text/csv' } as File), false);
  assert.equal(isCsvFile({ name: 'report.csv', type: 'application/json' } as File), false);
});
