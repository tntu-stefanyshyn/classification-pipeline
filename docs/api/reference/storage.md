# Storage operations

The backend never receives the dataset: it only signs S3 URLs. The desktop app uploads straight to the bucket and workers download from it. The bucket and region come from `AWS_S3_BUCKET` and `AWS_REGION`, and the bucket needs the CORS rule from the [setup guide](../../../SETUP.md); without the configuration the operations fail with `S3 bucket and region must be configured`.

| Operation           | Kind  | Access                         | Purpose                                   |
| ------------------- | ----- | ------------------------------ | ----------------------------------------- |
| `signedUploadUrl`   | Query | Signed-in user                 | A presigned `PUT` URL for a new CSV file. |
| `signedDownloadUrl` | Query | Uploader of the file or worker | A presigned `GET` URL for a file record.  |

Both return a `SignedUploadUrl`: `url`, `key` and `expiresIn` (seconds, `AWS_S3_PRESIGN_EXPIRES`, 900 by default).

## Uploading a dataset

1. Ask for a URL with `signedUploadUrl`.
2. `PUT` the file to `url`. When you passed a `mimeType`, send it as the `Content-Type` header.
3. Register the file with [`createUploadedFile`](files.md#createuploadedfile), passing the `key` from step 1.

```bash
curl -sS -X PUT "$URL" -H 'Content-Type: text/csv' --data-binary @eeg.csv
```

## `signedUploadUrl`

`signedUploadUrl(input: SignedUploadRequest!): SignedUploadUrl!`

| Input field | Type    | Required | Meaning                                                      |
| ----------- | ------- | -------- | ------------------------------------------------------------ |
| `filename`  | String! | Yes      | Name of the file; it must end with `.csv`.                   |
| `mimeType`  | String  | No       | One of `text/csv`, `application/vnd.ms-excel`, `text/plain`. |

The key is issued under the caller's prefix: `uploads/<user id>/<time>-<random>-<signature>-<file name>`. The signature (an HMAC with `JWT_SECRET`) is what lets `createUploadedFile` accept only keys that the backend issued to this user. Slashes in the file name are replaced with `_`. Errors: `Filename is required`, `Only CSV files are allowed` (a wrong extension or MIME type).

```graphql
query Upload($input: SignedUploadRequest!) {
  signedUploadUrl(input: $input) {
    url
    key
    expiresIn
  }
}
```

```json
{ "input": { "filename": "eeg.csv", "mimeType": "text/csv" } }
```

## `signedDownloadUrl`

`signedDownloadUrl(fileId: ID!): SignedUploadUrl!`

Returns a `GET` URL for the object of a file record (`key` is the record's storage key). A user gets it only for their own files; a worker (service token) for any file. Compute containers use it to download the dataset. Errors: `File _id is required`, `File _id is invalid`, `File not found`.

```graphql
query Download($fileId: ID!) {
  signedDownloadUrl(fileId: $fileId) {
    url
    expiresIn
  }
}
```
