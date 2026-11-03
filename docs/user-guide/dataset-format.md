# Dataset format

An experiment classifies the rows of one CSV file. The file is checked when a computation starts, so
a wrong file is accepted by the upload and fails only later. Check your file against this page
before you upload it.

## Requirements

| Requirement                     | Details                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| File type                       | A `.csv` file. The app rejects other extensions with "Only CSV files are supported."  |
| Separator                       | A semicolon (`;`). A comma-separated file is rejected.                                |
| Header                          | The first row holds the column names.                                                 |
| Columns                         | At least 3: the class label followed by at least 2 feature columns.                   |
| First column                    | The class label of the row. Any text or number; spaces around the value are removed.  |
| Other columns                   | Numeric features only. Use a dot as the decimal separator (`1.25`, not `1,25`).       |
| Missing values                  | Not allowed. Every cell must be filled.                                               |
| Infinite values (`inf`, `-inf`) | Not allowed.                                                                          |
| Rows                            | At least 1 data row below the header; use enough rows for the chosen number of folds. |

## Example

[`example-dataset.csv`](example-dataset.csv) is a valid file you can use to try the application:
60 rows, two classes (`relaxed` and `focused`, 30 rows each) and four numeric columns.

```csv
class;channel_1;channel_2;channel_3;channel_4
focused;1.212;0.561;1.620;-1.513
relaxed;-1.509;0.186;-1.076;-0.239
focused;0.494;-1.864;1.879;-0.807
```

## What happens with a wrong file

The computation fails, the pipeline goes back to **Idle**, and the error is shown in the **Current
message** of the pipeline results (the **i** button in the pipeline row).

| Problem in the file                       | Error in the pipeline results                                        |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Comma instead of a semicolon              | The run fails with "Невалідний файл".                                |
| Decimal comma (`1,5`) in a feature column | The run fails with "Невалідний файл".                                |
| Text in a feature column                  | The run fails with "Невалідний файл".                                |
| An empty cell                             | The run fails with "Невалідний файл".                                |
| `inf` in a feature column                 | The run fails with "Невалідний файл".                                |
| Only the label and one feature column     | The run fails with "Невалідний файл".                                |
| A header row and no data rows             | The run fails with `EEG_FILE_EMPTY`.                                 |
| A completely empty file                   | The run fails with a pandas error ("No columns to parse from file"). |

"Невалідний файл" means "Invalid file". See [Troubleshooting](troubleshooting.md#the-run-fails-with-невалідний-файл-or-eeg_file_empty) for the fix.

The checks above were run against the file validation code of the computation job
(`aws-jobs/src/aws_jobs/compute_handler.py`).
