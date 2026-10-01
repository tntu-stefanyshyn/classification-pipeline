import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { sleep, stringIdToObjectId, stringIdsToObjectIds } from './index';

test('utils convert string ids to ObjectId instances', () => {
  const firstId = new Types.ObjectId().toHexString();
  const secondId = new Types.ObjectId().toHexString();

  const single = stringIdToObjectId(firstId);
  const multiple = stringIdsToObjectIds([firstId, secondId]);

  assert.equal(single instanceof Types.ObjectId, true);
  assert.equal(single.toHexString(), firstId);
  assert.deepEqual(
    multiple.map((id) => id.toHexString()),
    [firstId, secondId]
  );
  assert.equal(
    multiple.every((id) => id instanceof Types.ObjectId),
    true
  );
});

test('utils.sleep resolves asynchronously', async () => {
  let settled = false;
  const promise = sleep(0).then(() => {
    settled = true;
  });

  assert.equal(settled, false);
  await promise;
  assert.equal(settled, true);
});
