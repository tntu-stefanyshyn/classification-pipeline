# 0003: GraphQL callbacks from workers

Status: Accepted

## Context

Compute and optimization jobs run in containers on the user's machine, on the backend host or in AWS Batch, and have to read an experiment and report progress and results.

## Decision

Containers do not use MongoDB. They call the backend's GraphQL API with the service token: they read the pipeline, the experiment and a presigned dataset URL, and report with `updatePipelineProgress`, `completePipeline`, `updatePipelineOptimization`, `updateExperimentProgress` and `updateExperimentOptimizationResult`. A failure ends with a non-zero exit code, which the worker turns into `failExperimentRun`.

## Rationale

- **Confirmed:** the AWS guide states that the compute handler completes a pipeline through GraphQL callbacks and therefore needs `COMPUTE_BACKEND_URL`, which must be reachable from AWS. Every report carries the `executionId`, so the backend can ignore reports of an old execution.
- **Assumed:** all status rules stay in one place (the backend) and containers need no database credentials. The original reasoning is not recorded.

## Consequences

- The backend must be reachable from every container; for AWS Batch it needs a real URL, not `host.docker.internal`.
- The backend also supports a second path: `CloudComputationWorker` reserves a result key in S3 and reads a result file for running `cloud` runs. The current `aws-jobs` handler never writes that file (see [Known limitations](../known-limitations.md)).
- A worker whose container dies without reporting must report the failure itself; nothing detects a silent crash (see [Known limitations](../known-limitations.md)).
