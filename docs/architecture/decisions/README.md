# Architecture decision records

Short records of the main design choices. They describe decisions that are already implemented; they were written afterwards, so each record separates what the code, the documentation or the history confirms from what is only assumed.

| Record                                         | Decision                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| [0001](0001-two-kinds-of-workers.md)           | Two kinds of workers: a desktop worker for `local`, backend workers for `cloud` |
| [0002](0002-mongo-backed-workflows.md)         | Statuses are stored in Mongo `workflows` documents with a transition table      |
| [0003](0003-graphql-callbacks-from-workers.md) | Containers read data and report results through the GraphQL API                 |

## Format

- **Status**: `Accepted` (implemented and in use).
- **Context**, **Decision** and **Consequences**: what the code does today.
- **Rationale**: **Confirmed** lists reasons that are stated in code comments, documentation or commits. **Assumed** lists likely reasons that nobody recorded; treat them as hypotheses and replace them when the authors confirm.

To change a decision, add a new record that supersedes the old one instead of editing it.
