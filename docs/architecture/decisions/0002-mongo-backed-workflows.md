# 0002: Statuses in Mongo workflow documents

Status: Accepted

## Context

Experiments and pipelines both have a status that changes along fixed transitions, and several workers and API calls can change a pipeline at the same time.

## Decision

The status and its history are not stored on the experiment or pipeline. They are stored in a `workflows` document (`type`, `instanceId`, `status`, `history`, `executionId`, `machineHostname`). `WorkflowManager.changeStatus` looks the transition up in a list owned by `ExperimentManager` or `PipelineManager`, writes the new status with a conditional update on the previous status, and then runs the side effect of the transition.

## Rationale

- **Confirmed:** the conditional update exists so that concurrent claimers cannot both win a transition (code comment in `WorkflowManager`). The unique partial index on `machineHostname` and the `executionId` fence are built on the same document, so the claim is one atomic write (code comments and the [domain page](../../domain/experiments.md#claiming-runs)).
- **Assumed:** one generic mechanism for two entity types and a built-in status history. The reason for keeping the status apart from the entities is not recorded.

## Consequences

- A status read needs the workflow (`getWorkflow`, or `$lookup` in aggregations); `workflows.instanceId` has no index.
- The status write and its side effect are not one transaction: the side effect runs after the status is written, and a failing side effect leaves the new status in place. `ExperimentManager` reverts `computing` itself when the file check fails.
- Adding a status or a transition means editing the transition list and the status enums, and the diagrams in [Lifecycle](../lifecycle.md).
