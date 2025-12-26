import { prop } from '@typegoose/typegoose';
import { Field, InputType, ObjectType } from 'type-graphql';

@ObjectType()
@InputType('GraphNodeSettingInput')
export class GraphNodeSetting {
  @Field()
  @prop({ required: true, trim: true })
  key!: string;

  @Field()
  @prop({ required: true, trim: true })
  value!: string;
}
