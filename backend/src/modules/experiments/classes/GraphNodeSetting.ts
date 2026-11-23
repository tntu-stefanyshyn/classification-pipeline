import { prop } from '@typegoose/typegoose';
import { Field, InputType, ObjectType } from 'type-graphql';

@ObjectType({ description: 'The value of one technology setting on a node.' })
@InputType('GraphNodeSettingInput', {
  description: 'The value of one technology setting on a node.',
})
export class GraphNodeSetting {
  @Field({ description: 'Key of the setting, as in the technology.' })
  @prop({ required: true, trim: true })
  key!: string;

  @Field({ description: 'Value, as text.' })
  @prop({ required: true, trim: true })
  value!: string;
}
