import { getModelForClass } from '@typegoose/typegoose';

import { AppliedMigration } from '../classes/AppliedMigration';

export const appliedMigrationsCollectionName = 'applied_migrations';

export const AppliedMigrationModel = getModelForClass(AppliedMigration, {
  schemaOptions: { collection: appliedMigrationsCollectionName },
});
