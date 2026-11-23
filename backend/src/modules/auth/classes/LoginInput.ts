import { Field, InputType } from 'type-graphql';

@InputType({ description: 'Credentials for `login`.' })
export class LoginInput {
  @Field({ description: 'Email address of the account.' })
  email!: string;

  @Field({ description: 'Password of the account.' })
  password!: string;
}
