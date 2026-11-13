import { Field, Int, ObjectType } from 'type-graphql';

@ObjectType({ description: 'State of the running backend.' })
export class ServerInfo {
  @Field({ description: 'Version from `package.json`, or `dev` when it is unknown.' })
  version!: string;

  @Field({ description: 'Always `ok` while the backend answers.' })
  status!: string;

  @Field(() => Int, { description: 'Seconds since the backend started.' })
  uptimeSeconds!: number;
}
