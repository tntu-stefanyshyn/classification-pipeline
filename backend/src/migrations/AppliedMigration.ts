import { getModelForClass, prop } from '@typegoose/typegoose';

export class AppliedMigration {
  @prop({ required: true, unique: true, type: () => String })
  name!: string;

  @prop({ required: true, default: Date.now, type: () => Date })
  appliedAt!: Date;
}

export const appliedMigrationsCollectionName = 'applied_migrations';

export const AppliedMigrationModel = getModelForClass(AppliedMigration, {
  schemaOptions: { collection: appliedMigrationsCollectionName },
});
