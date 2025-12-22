import { Field, Int, ObjectType } from 'type-graphql';

@ObjectType()
export class ServerInfo {
  @Field()
  version!: string;

  @Field()
  status!: string;

  @Field(() => Int)
  uptimeSeconds!: number;
}
