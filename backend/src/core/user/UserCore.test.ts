import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import * as userIndex from './index';
import { User } from './classes/User';
import { UserModel, usersCollectionName } from './models/UserModel';

test('core user exports and model metadata are available', () => {
  const user = new User();
  const now = new Date();

  user._id = new Types.ObjectId();
  user.email = 'user@example.com';
  user.passwordHash = 'hash';
  user.name = 'Ivan';
  user.createdAt = now;
  user.updatedAt = now;

  assert.equal(usersCollectionName, 'users');
  assert.equal(UserModel.modelName, 'User');
  assert.equal(user.email, 'user@example.com');
  assert.equal(user.name, 'Ivan');
  assert.equal(userIndex.User, User);
  assert.equal(userIndex.UserModel, UserModel);
});
