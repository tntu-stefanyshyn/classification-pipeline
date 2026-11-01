# User guide

This guide takes you through the whole workflow in the desktop application: from signing in and
uploading a dataset to reading the results and downloading the PDF report. Button and field names
are given as they appear in the English interface (switch the language with **EN** / **UA** in the
application). The terms (experiment, graph, stage, path, pipeline, queue, fold) are defined in
[Experiments and computations](../domain/experiments.md#terms).

Before you start, install and start the application as described in the
[setup guide](../../SETUP.md) and prepare a dataset that follows the
[dataset format](dataset-format.md). To try the application first, use
[`example-dataset.csv`](example-dataset.csv). If something goes wrong, see
[Troubleshooting](troubleshooting.md).

## 1. Create an account and sign in

1. On the **Sign in** page choose **Create one**.
2. Fill in the full name, email and password (at least 6 characters) and choose
   **Create account**.
3. Sign in with the email and password. **Log out** is at the bottom of the left menu.

The left menu has three sections: **Overview** (system status and the latest files and
experiments), **Experiments** and **Files**.

## 2. Upload a dataset

1. Open **Files** and choose **Upload file**.
2. Select a `.csv` file. Other file types are rejected with "Only CSV files are supported."
3. The file appears in the **Uploaded files** list with its size and status.

The app only checks the file extension. The content is checked when a computation starts, so verify the
file against the [dataset format](dataset-format.md) first.

To remove a file choose **Delete** in its row. The file is detached from the experiments that use
it, and it cannot be deleted while one of them is computing or optimizing.

## 3. Create an experiment

1. Open **Experiments** and choose **Create experiment**.
2. Enter the **Experiment name** (required) and an optional **Description** (up to 400
   characters).
3. Choose **Upload CSV** to attach a dataset. You can also attach it later.
4. Choose **Create experiment**, then **Open** the new experiment in the list.

The experiment page shows its details, the attached **EEG file** and the status. Use **Edit** to
change the name, the description or the file (pick an uploaded one or upload a new CSV).

## 4. Build the graph

An experiment describes the processing as a graph. Each node is a technology that belongs to one
stage, and the stages always go in this order:

1. Preprocessing
2. Data enhancement
3. Feature extraction
4. Dimensionality reduction
5. Classification

Every chain of nodes from the start to a leaf is a **path**, and every path must end with a
**Classification** node.

Open the graph with **Constructor** on the experiment page.

**Build it by hand**

- **Add node** adds a node after the start, **Add child node** adds one after an existing node. Pick
  the stage, the technology and, if the technology has them, its settings. A child node can only
  belong to a later stage than its parent.
- **View node**, **Edit node** and **Delete node** work on an existing node. Deleting a node
  deletes all its child nodes too and cannot be undone.
- **Collapse branch** and **Expand branch** hide and show a branch of a large graph.

**Build it automatically**

- Choose **Auto-fill**, select the technologies for each stage and choose **Generate**. Select at
  least one technology for the Classification stage; the other stages are optional.

**Start over**

- **Reset graph** deletes all nodes. It asks for confirmation.

## 5. Set the graph settings

Choose **Edit settings** (on the experiment page or in the constructor).

| Setting                                    | Meaning                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Metric weights (%)                         | How important accuracy, F1, ROC AUC and NTPS are. The four weights must add up to 100%. |
| Cross-validation folds                     | Into how many parts the data is split for validation. An integer greater than 0.        |
| Hyper-optimization time per pipeline (min) | How long the optimization may spend on one pipeline. An integer greater than 0.         |
| Prediction data percentage (%)             | The share of data held back for prediction, from 1 to 99.                               |
| Execution modes                            | **Local** (on your computer), **Cloud**, or both. At least one is required.             |

NTPS is the normalized time to process one sample of data.

## 6. Start the computations

Choose **Move to computing**. The button is enabled when the graph settings are saved and valid,
and a dataset is attached. After this step the experiment, the graph and the settings can no longer
be edited.

The **Computing** card lists one pipeline per path (and per selected mode, so two when both
**Local** and **Cloud** are selected). The preview graph colors each pipeline by its status:

| Color      | Status    |
| ---------- | --------- |
| Light gray | Idle      |
| Blue       | Queued    |
| Yellow     | Running   |
| Green      | Completed |

- **Run locally** and **Run in cloud** start a pipeline in the chosen mode. A local run is executed
  by the desktop application on your computer with Docker, so keep the application open until it
  finishes. A cloud run is executed by the backend (Docker worker or AWS Batch) and needs the cloud
  worker to be configured.
- **Stop** stops a running pipeline and returns it to idle. **Rerun** starts a finished pipeline
  again.
- **Move all to waiting** puts every local pipeline that is idle or running into the queue
  (status **Queued**), where the desktop application picks it up.
- **Results** opens the details of the latest run: the metrics, the confusion matrices for every
  cross-validation fold, the dataset information, the device that executed the run, and the
  execution history.

## 7. Run the optimization

When every pipeline is **Completed**, the **Optimization** card becomes available.

1. Choose **Start optimization**. The progress and the latest message are shown while it runs.
2. When it finishes you see the **Best pipeline** with its composition, the **Leaderboard** with
   the score of each pipeline, a chart that compares the pipelines and the optimization
   **History** log.

The score of a pipeline is the integral value: the weighted sum of its normalized metrics using the
metric weights. **A lower score is better.** Choose **Restart optimization** to run it again.

## 8. Read the results and download the report

When the optimization has finished, the experiment status is **Completed** and **Download PDF**
appears at the top of the experiment page. The report contains the experiment details, the graph
settings, every pipeline with its stage settings and per-fold metrics, and the best pipeline.
