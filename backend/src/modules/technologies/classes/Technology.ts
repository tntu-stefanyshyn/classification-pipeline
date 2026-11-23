import { prop } from '@typegoose/typegoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { ClassificationStage } from '../../experiments/classes/ClassificationStage';
import { TechnologySetting } from './TechnologySetting';
import { Types } from 'mongoose';

@ObjectType({ description: 'A technology of the catalog that can be a node of a graph.' })
export class Technology {
  @Field(() => ID, { description: 'Id of the technology.' })
  _id!: Types.ObjectId;

  @Field({ description: 'Unique name; graph nodes refer to it.' })
  @prop({ required: true, unique: true, trim: true })
  name!: string;

  @Field({ nullable: true, description: 'Name shown to users.' })
  @prop({ trim: true })
  displayName?: string;

  @Field(() => ClassificationStage, { description: 'The stage the technology belongs to.' })
  @prop({ required: true, enum: ClassificationStage, type: () => String })
  stage!: ClassificationStage;

  @Field(() => [TechnologySetting], {
    description: 'Settings that can be configured for the technology.',
  })
  @prop({ type: () => [TechnologySetting], _id: false, default: [] })
  settings!: TechnologySetting[];
}
