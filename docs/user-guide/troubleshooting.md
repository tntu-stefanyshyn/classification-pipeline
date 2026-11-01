# Troubleshooting

This page covers problems you can meet while working with experiments. Problems with installing and
starting the application (CORS and S3 errors, Docker, port 4000, `Not authenticated`, WSL) are
described in the [setup guide](../../SETUP.md#troubleshooting).

## The run fails with "Невалідний файл" or `EEG_FILE_EMPTY`

**Cause:** the dataset does not meet the [dataset format](dataset-format.md). The upload only checks
the file extension, so the content is validated when the run starts.

**Fix:** correct the file (semicolon separator, numeric features with a dot decimal separator, no
empty cells, at least 3 columns and one data row), upload it on the **Files** page and attach it to
the experiment. While the experiment is still being configured you can change the file with
**Edit**. After computations have started the file cannot be replaced; create a new experiment
instead.

## "Add a CSV file to the experiment before starting computations."

**Cause:** the experiment has no file. **Move to computing** stays disabled until a file is attached.

**Fix:** open **Edit**, pick an existing CSV or upload a new one, and save.

## "Move to computing" is disabled

The button needs all three conditions:

- the experiment status is `configuring` (the graph has been edited);
- the graph settings are saved and valid (metric weights adding up to 100%, at least one execution mode, the optimization time per pipeline and the prediction data percentage);
- a CSV file is attached.

## The graph settings cannot be saved

The settings form shows the reason:

- "The weight sum must equal 100%." Set the four metric weights so they add up to 100.
- "Select at least one computation mode." Choose **Local**, **Cloud** or both.
- "Cross-validation folds must be an integer greater than 0."
- "Prediction data percentage must be an integer from 1 to 99."

## "All pipelines must contain a classification stage."

**Cause:** at least one path of the graph does not end with a node from the **Classification** stage.

**Fix:** open the **Constructor** and add a classification node to every path, or use **Auto-fill**
and select at least one classification technology.

## The run stays in "Queued"

A local run waits for the desktop worker. Keep the desktop app open and make sure Docker is
running. See "Local runs stay queued" in the [setup guide](../../SETUP.md#troubleshooting). A cloud
run waits for a worker on the backend or in AWS Batch.

## Cloud runs do not start, and the backend prints "Хмарний воркер вимкнено"

The message means "Cloud worker disabled: AWS Batch or the results bucket is not configured". It
appears when the backend starts without the AWS Batch settings.

**Fix:** configure AWS Batch and the results bucket as described in
[AWS Jobs (AWS Batch)](../operations/aws-batch.md), restart the backend, or use the **Local**
execution mode.

## The PDF report button is missing

**Download PDF** appears only when the experiment status is `completed`. Finish the computations and
the optimization first.
