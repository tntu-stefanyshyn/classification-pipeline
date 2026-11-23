# Authentication operations

Five operations create and manage a user's session. The token rules, their lifetimes and the refresh flow are in [Authentication](../authentication.md); this page lists the operations.

| Operation        | Kind     | Access         | Purpose                                             |
| ---------------- | -------- | -------------- | --------------------------------------------------- |
| `register`       | Mutation | Public         | Creates an account and signs the user in.           |
| `login`          | Mutation | Public         | Signs in with email and password.                   |
| `refreshSession` | Mutation | Public         | Exchanges a refresh token for a new pair of tokens. |
| `logout`         | Mutation | Public         | Ends the session of a refresh token.                |
| `me`             | Query    | Signed-in user | Returns the user of the access token.               |

`register`, `login` and `refreshSession` return an `AuthPayload`:

| Field          | Type    | Meaning                                                                                                       |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `token`        | String! | Access token (JWT) for the `Authorization: Bearer` header; valid for `ACCESS_TOKEN_TTL` (15 minutes).         |
| `refreshToken` | String! | Opaque token for `refreshSession` and `logout`; it can be used once. Valid for `REFRESH_TOKEN_TTL` (30 days). |
| `user`         | User!   | `_id`, `email`, `name`, `createdAt`, `updatedAt`.                                                             |

## `register`

`register(input: RegisterInput!): AuthPayload!`

| Input field | Type    | Required | Meaning                                        |
| ----------- | ------- | -------- | ---------------------------------------------- |
| `email`     | String! | Yes      | Stored trimmed and in lower case; must be new. |
| `password`  | String! | Yes      | Stored as a bcrypt hash.                       |
| `name`      | String  | No       | Display name.                                  |

Errors: `User already exists` when the email is registered.

```graphql
mutation Register($input: RegisterInput!) {
  register(input: $input) {
    token
    refreshToken
    user {
      _id
      email
      name
    }
  }
}
```

```json
{ "input": { "email": "ada@example.com", "password": "correct horse", "name": "Ada" } }
```

## `login`

`login(input: LoginInput!): AuthPayload!` with `email` and `password`.

Errors: `Invalid credentials` with `extensions.code: "INVALID_CREDENTIALS"` for an unknown email and for a wrong password alike. It is not `UNAUTHENTICATED`: there is no session to refresh.

```bash
curl -sS http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  --data '{"query":"mutation($input: LoginInput!){ login(input:$input){ token refreshToken user{ _id email } } }","variables":{"input":{"email":"ada@example.com","password":"correct horse"}}}'
```

```json
{
  "data": {
    "login": {
      "token": "eyJhbGciOi...",
      "refreshToken": "6f1c...<session>.<random>.<signature>",
      "user": { "_id": "6740f0c2a1b2c3d4e5f60718", "email": "ada@example.com" }
    }
  }
}
```

## `refreshSession`

`refreshSession(refreshToken: String!, attemptId: String): AuthPayload!`

Needs no access token: it is how a client gets a new one after the old one expired. The presented refresh token stops working and the answer holds the next one (rotation).

| Argument       | Meaning                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `refreshToken` | The refresh token from the last `login`, `register` or `refreshSession`.                                                                |
| `attemptId`    | Optional id of this exchange. Repeat the call with the same value when the answer was lost, and the same new refresh token is returned. |

Errors: `Session expired` (code `UNAUTHENTICATED`) for an unknown, expired, used or revoked refresh token. A refresh token that is presented a second time with another `attemptId` revokes the whole session.

```graphql
mutation Refresh($refreshToken: String!, $attemptId: String) {
  refreshSession(refreshToken: $refreshToken, attemptId: $attemptId) {
    token
    refreshToken
  }
}
```

## `logout`

`logout(refreshToken: String!): Boolean!`

Revokes the session of the refresh token. It returns `true` also for an unknown token, so the call can be repeated safely; any other answer, including an error, means the session may still be active.

```graphql
mutation Logout($refreshToken: String!) {
  logout(refreshToken: $refreshToken)
}
```

## `me`

`me: User!`

Returns the user of the access token. Errors: `Not authenticated` without a token, the verification error (`jwt malformed`, `jwt expired`) for a bad token, `User not found` for a token of a deleted user; all with code `UNAUTHENTICATED`.

```graphql
query {
  me {
    _id
    email
    name
  }
}
```
