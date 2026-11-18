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
  description: 'Kind of value of a technology setting.',
  valuesConfig: {
    TEXT: { description: 'Free text.' },
    NUMBER: { description: 'A number.' },
    SELECT: { description: 'One of the listed options.' },
    BOOLEAN: { description: 'Yes or no.' },
  },
});

@ObjectType({ description: 'A configurable setting of a technology.' })
export class TechnologySetting {
  @Field({ description: 'Key used in `GraphNodeSetting.key`.' })
  @prop({ required: true, trim: true })
  key!: string;

  @Field({ description: 'Name shown to users.' })
  @prop({ required: true, trim: true })
  label!: string;

  @Field(() => TechnologySettingType, { description: 'Kind of the value.' })
  @prop({ required: true, enum: TechnologySettingType })
  type!: TechnologySettingType;

  @Field({ nullable: true, description: 'Whether a value is required.' })
  @prop({ default: false })
  required?: boolean;

  @Field({ nullable: true, description: 'Hint shown in an empty input.' })
  @prop({ trim: true })
  placeholder?: string;

  @Field({ nullable: true, description: 'Value used when none is given.' })
  @prop({ trim: true })
  defaultValue?: string;

  @Field(() => [String], { nullable: true, description: 'Allowed values of a `SELECT` setting.' })
  @prop({ type: () => [String] })
  options?: string[];
}
