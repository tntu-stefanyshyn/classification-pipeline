import { prop } from '@typegoose/typegoose';

export class AppliedMigration {
  @prop({ required: true, unique: true, type: () => String })
  name!: string;

  @prop({ required: true, default: Date.now, type: () => Date })
  appliedAt!: Date;
}
