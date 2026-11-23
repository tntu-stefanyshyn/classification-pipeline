# File operations

A file record describes a CSV dataset stored in S3. The upload itself goes straight to S3 with a presigned URL (see [Storage](storage.md)); these operations register, list and delete the records. A file belongs to the user who registered it.

| Operation            | Kind     | Access         | Purpose                                                          |
| -------------------- | -------- | -------------- | ---------------------------------------------------------------- |
| `uploadedFiles`      | Query    | Signed-in user | The user's files, newest first.                                  |
| `createUploadedFile` | Mutation | Signed-in user | Registers a file that was uploaded to S3.                        |
| `uploadedFileUsage`  | Query    | Signed-in user | The experiments that use a file and whether deletion is blocked. |
| `deleteUploadedFile` | Mutation | Signed-in user | Deletes a file and detaches it from the experiments that use it. |

The `UploadedFile` type has `_id`, `filename`, `sizeMb`, `status` (text, `uploaded` by default), `uploadedAt` and `uploadedByName`.

## `uploadedFiles`

`uploadedFiles: [UploadedFile!]!`

```graphql
query {
  uploadedFiles {
    _id
    filename
    sizeMb
    uploadedAt
  }
}
```

## `createUploadedFile`

`createUploadedFile(input: CreateUploadedFileInput!): UploadedFile!`

| Input field  | Type    | Required | Meaning                                                |
| ------------ | ------- | -------- | ------------------------------------------------------ |
| `filename`   | String! | Yes      | Original name; it must end with `.csv`.                |
| `storageKey` | String! | Yes      | The `key` returned by `signedUploadUrl` for this user. |
| `sizeMb`     | Int!    | Yes      | Size in megabytes, greater than 0.                     |
| `status`     | String  | No       | Status text; `uploaded` by default.                    |

The key must have been issued to the caller (it carries a signature made with `JWT_SECRET`) and must not be registered yet, so a record never points at another user's object. Errors:

| Message                                           | Meaning                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `Only CSV files are allowed`                      | The name does not end with `.csv`.                                   |
| `Filename is required`, `Storage key is required` | A value is blank.                                                    |
| `sizeMb must be positive`                         | The size is 0 or negative.                                           |
| `Storage key was not issued to this user`         | The key was built by the caller, changed, or issued to another user. |
| `File is already registered`                      | Another record uses the key.                                         |

```graphql
mutation Register($input: CreateUploadedFileInput!) {
  createUploadedFile(input: $input) {
    _id
    filename
  }
}
```

```json
{
  "input": {
    "filename": "eeg.csv",
    "storageKey": "uploads/6740f0c2a1b2c3d4e5f60718/1731500000000-9f2c1a7b3d4e-0c1d...-eeg.csv",
    "sizeMb": 12
  }
}
```

## `uploadedFileUsage`

`uploadedFileUsage(_id: ID!): UploadedFileUsage!`

Shows what deleting the file would affect. Only the owner of the file can ask (`File not found` otherwise).

| Field                   | Meaning                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `experiments`           | The caller's experiments that use the file: `_id`, `name`, `status`, `blocking`.                      |
| `otherExperimentsCount` | How many experiments of other users use it. They are only counted, never named.                       |
| `blocked`               | True if any experiment that uses the file is `computing` or `optimization`: deletion is refused then. |

```graphql
query Usage($id: ID!) {
  uploadedFileUsage(_id: $id) {
    experiments {
      _id
      name
      status
      blocking
    }
    otherExperimentsCount
    blocked
  }
}
```

## `deleteUploadedFile`

`deleteUploadedFile(_id: ID!, detachExperimentIds: [ID!]): UploadedFile!`

Deletes the S3 object and the record and clears `fileId` on the experiments that used the file. A file that experiments use can be deleted, with two rules:

1. It is refused while any experiment that uses the file is `computing` or `optimization`, also an experiment of another user: `Файл не можна видалити, поки триває обчислення або оптимізація експериментів (...). Дочекайтеся завершення.` ("The file cannot be deleted while computations or optimization of the experiments are running. Wait for them to finish.").
2. The owner must confirm the detachment: `detachExperimentIds` has to list **every** experiment of the caller that still uses the file (as returned by `uploadedFileUsage`). Otherwise: `Файл використовується в експериментах (...). Підтвердіть відʼєднання файлу від них і повторіть видалення.` ("The file is used in experiments. Confirm detaching it from them and repeat the deletion.") An experiment that started using the file after the list was read is not detached by mistake.

Other errors: `File not found`, `Файл уже видаляється. Спробуйте пізніше.` ("The file is already being deleted. Try later.") and `Видалення файла перехопив інший запит. Повторіть видалення.` ("Another request took over the deletion. Repeat it."). A failed step can be retried. See [Data model](../../architecture/data-model.md#relations) for the details of the deletion.

```graphql
mutation Delete($id: ID!, $detach: [ID!]) {
  deleteUploadedFile(_id: $id, detachExperimentIds: $detach) {
    _id
    filename
  }
}
```

```json
{ "id": "6740f0c2a1b2c3d4e5f60719", "detach": ["6740f0c2a1b2c3d4e5f6071a"] }
```
