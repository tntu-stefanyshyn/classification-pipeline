import { Field, InputType } from 'type-graphql';

@InputType({ description: 'Data for creating an account.' })
export class RegisterInput {
  @Field({ description: 'Email address. It must not be registered yet.' })
  email!: string;

  @Field({ description: 'Password of the new account.' })
  password!: string;

  @Field({ nullable: true, description: 'Optional display name.' })
  name?: string;
}
