import { prop } from '@typegoose/typegoose';
import { Field, ObjectType, registerEnumType } from 'type-graphql';

export enum TechnologySettingType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  SELECT = 'SELECT',
  BOOLEAN = 'BOOLEAN',
}

registerEnumType(TechnologySettingType, {
  name: 'TechnologySettingType',
});

@ObjectType()
export class TechnologySetting {
  @Field()
  @prop({ required: true, trim: true })
  key!: string;

  @Field()
  @prop({ required: true, trim: true })
  label!: string;

  @Field(() => TechnologySettingType)
  @prop({ required: true, enum: TechnologySettingType })
  type!: TechnologySettingType;

  @Field({ nullable: true })
  @prop({ default: false })
  required?: boolean;

  @Field({ nullable: true })
  @prop({ trim: true })
  placeholder?: string;

  @Field({ nullable: true })
  @prop({ trim: true })
  defaultValue?: string;

  @Field(() => [String], { nullable: true })
  @prop({ type: () => [String] })
  options?: string[];
}
