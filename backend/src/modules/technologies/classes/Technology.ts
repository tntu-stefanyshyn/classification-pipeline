import { prop } from '@typegoose/typegoose';
import { Field, ID, ObjectType } from 'type-graphql';
import { ClassificationStage } from '../../experiments/classes/ClassificationStage';
import { TechnologySetting } from './TechnologySetting';
import { Types } from 'mongoose';

@ObjectType()
export class Technology {
  @Field(() => ID)
  _id!: Types.ObjectId;

  @Field()
  @prop({ required: true, unique: true, trim: true })
  name!: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  displayName?: string;

  @Field(() => ClassificationStage)
  @prop({ required: true, enum: ClassificationStage, type: () => String })
  stage!: ClassificationStage;

  @Field(() => [TechnologySetting])
  @prop({ type: () => [TechnologySetting], _id: false, default: [] })
  settings!: TechnologySetting[];
}
