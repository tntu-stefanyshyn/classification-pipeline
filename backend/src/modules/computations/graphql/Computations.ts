import { Arg, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql';
import { ComputationRun } from '../classes/ComputationRun';
import { ComputationResult } from '../classes/ComputationResult';
import { OptimizationResult } from '../classes/OptimizationResult';
import { ComputationQueue } from '../classes/ComputationQueue';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
import { StopExperimentRunInput } from '../classes/StopExperimentRunInput';
import { UpdateExperimentRunInput } from '../classes/UpdateExperimentRunInput';
import { CompleteExperimentRunInput } from '../classes/CompleteExperimentRunInput';
import { FailExperimentRunInput } from '../classes/FailExperimentRunInput';
import { ComputationMachineInfoInput } from '../classes/ComputationMachineInfo';
import { ComputationManager } from '../services/ComputationManager';
import { GraphStructureModel } from '../../experiments/models/GraphStructureModel';
import { GraphNode } from '../../experiments/classes/GraphNode';

@Resolver(() => ComputationRun)
export class Computations {
  private readonly manager = new ComputationManager();

  @FieldResolver(() => [GraphNode])
  async pathNodes(@Root() { experimentId, pathNodeIds }: ComputationRun): Promise<GraphNode[]> {
    const graphNodes = await GraphStructureModel.aggregate<GraphNode>([
      { $match: { experimentId } },
      { $unwind: '$nodes' },
      { $replaceRoot: { newRoot: '$nodes' } },
      { $match: { _id: { $in: pathNodeIds } } },
    ]);

    const nodeMap = new Map(graphNodes.map((n) => [n._id.toString(), n]));

    const orderedNodes = pathNodeIds
      .map((id) => nodeMap.get(id.toString()))
      .filter(Boolean) as typeof graphNodes;

    return orderedNodes;
  }

  @Query(() => [ComputationRun])
  experimentRuns(
    @Arg('experimentId', () => ID) experimentId: string,
    @Arg('queue', () => ComputationQueue, { nullable: true }) queue?: ComputationQueue
  ): Promise<ComputationRun[]> {
    return this.manager.listByExperiment(experimentId, queue);
  }

  @Query(() => ComputationRun, { nullable: true })
  experimentRun(@Arg('runId', () => ID) runId: string): Promise<ComputationRun | null> {
    return this.manager.getRunById(runId);
  }

  @Query(() => [ComputationResult])
  experimentResults(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<ComputationResult[]> {
    return this.manager.listResultsByExperiment(experimentId);
  }

  @Query(() => OptimizationResult)
  optimizeExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<OptimizationResult> {
    return this.manager.optimizeExperimentRuns(experimentId);
  }

  @Mutation(() => [ComputationRun])
  enqueueExperimentRuns(
    @Arg('input', () => EnqueueExperimentRunsInput) input: EnqueueExperimentRunsInput
  ): Promise<ComputationRun[]> {
    return this.manager.enqueueRuns(input);
  }

  @Mutation(() => ComputationRun)
  stopExperimentRun(
    @Arg('input', () => StopExperimentRunInput) input: StopExperimentRunInput
  ): Promise<ComputationRun> {
    return this.manager.stopRun(input.runId);
  }

  @Mutation(() => ComputationRun, { nullable: true })
  claimExperimentRun(
    @Arg('queue', () => ComputationQueue) queue: ComputationQueue,
    @Arg('machineInfo', () => ComputationMachineInfoInput, { nullable: true })
    machineInfo?: ComputationMachineInfoInput
  ): Promise<ComputationRun | null> {
    return this.manager.claimNextRun(queue, machineInfo);
  }

  @Mutation(() => [ComputationRun])
  pauseExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<ComputationRun[]> {
    return this.manager.pauseExperimentRuns(experimentId);
  }

  @Mutation(() => [ComputationRun])
  resumeExperimentRuns(
    @Arg('experimentId', () => ID) experimentId: string
  ): Promise<ComputationRun[]> {
    return this.manager.resumeExperimentRuns(experimentId);
  }

  @Mutation(() => ComputationRun)
  updateExperimentRun(
    @Arg('input', () => UpdateExperimentRunInput) input: UpdateExperimentRunInput
  ): Promise<ComputationRun> {
    return this.manager.updateRun(input);
  }

  @Mutation(() => ComputationRun)
  completeExperimentRun(
    @Arg('input', () => CompleteExperimentRunInput) input: CompleteExperimentRunInput
  ): Promise<ComputationRun> {
    return this.manager.completeRun(input);
  }

  @Mutation(() => ComputationRun)
  failExperimentRun(
    @Arg('input', () => FailExperimentRunInput) input: FailExperimentRunInput
  ): Promise<ComputationRun> {
    return this.manager.failRun(input);
  }
}
