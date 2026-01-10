import { Arg, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql';
import { Experiment } from '../classes/Experiment';
import { CreateExperimentInput } from '../classes/CreateExperimentInput';
import { GenerateExperimentGraphInput } from '../classes/GenerateExperimentGraphInput';
import { UpdateExperimentInput } from '../classes/UpdateExperimentInput';
import { ExperimentManager } from '../services/ExperimentManager';
import { GraphManager } from '../services/GraphManager';
import { GraphStructure } from '../classes/GraphStructure';
import { ChangeExperimentStatusInput } from '../classes/ChangeExperimentStatusInput';
import { WorkflowManager } from '../../../core/workflow/services/WorkflowManager';
import { WorkflowType } from '../../../core/workflow/enums';
import { ExperimentStatus } from '../classes/ExperimentStatus';
import { UpdateExperimentProgressInput } from '../classes/UpdateExperimentProgressInput';
import { UpdateExperimentOptimizationResultInput } from '../classes/UpdateExperimentOptimizationResultInput';

@Resolver(() => Experiment)
export class Experiments {
  private readonly manager = new ExperimentManager();
  private readonly experimentManager = new ExperimentManager();
  private readonly graphManager = new GraphManager();
  private readonly workflowManager = new WorkflowManager();

  // #region FieldResolver
  @FieldResolver(() => GraphStructure, { nullable: true })
  graph(@Root() experiment: Experiment): Promise<GraphStructure | null> {
    return this.graphManager.getByExperimentId(experiment._id);
  }

  @FieldResolver(() => ExperimentStatus, { nullable: true })
  async status(@Root() { _id }: Experiment) {
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: _id,
      type: WorkflowType.EXPERIMENT,
    });
    return workflow.status;
  }
  // #endregion FieldResolver

  // #region Query
  @Query(() => [Experiment])
  experiments(): Promise<Experiment[]> {
    return this.manager.list();
  }

  @Query(() => Experiment, { nullable: true })
  experiment(@Arg('_id', () => ID) _id: string): Promise<Experiment | null> {
    return this.manager.getById(_id);
  }
  // #endregion Query

  // #region Mutation
  @Mutation(() => Experiment)
  createExperiment(
    @Arg('input', () => CreateExperimentInput) input: CreateExperimentInput
  ): Promise<Experiment> {
    return this.manager.create(input);
  }

  @Mutation(() => Experiment)
  async updateExperiment(
    @Arg('input', () => UpdateExperimentInput) input: UpdateExperimentInput
  ): Promise<Experiment> {
    const experiment = await this.manager.update(input);
    if (input.graphSettings || input.graphNodes || input.fileId) {
      const workflow = await this.workflowManager.getWorkflow({
        instanceId: input._id,
        type: WorkflowType.EXPERIMENT,
      });
      if (workflow.status !== ExperimentStatus.configuring) {
        await this.experimentManager.changeStatus({
          experimentId: input._id,
          status: ExperimentStatus.configuring,
        });
      }
    }
    return experiment;
  }

  @Mutation(() => Experiment)
  async generateExperimentGraph(
    @Arg('input', () => GenerateExperimentGraphInput) input: GenerateExperimentGraphInput
  ): Promise<Experiment> {
    const experiment = await this.manager.generateGraph(input);
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: input._id,
      type: WorkflowType.EXPERIMENT,
    });
    if (workflow.status !== ExperimentStatus.configuring) {
      await this.experimentManager.changeStatus({
        experimentId: input._id,
        status: ExperimentStatus.configuring,
      });
    }

    return experiment;
  }

  @Mutation(() => Boolean)
  changeExperimentStatus(
    @Arg('input', () => ChangeExperimentStatusInput) input: ChangeExperimentStatusInput
  ): Promise<boolean> {
    return this.experimentManager.changeStatus(input);
  }

  @Mutation(() => Boolean)
  async updateExperimentProgress(
    @Arg('input', () => UpdateExperimentProgressInput) input: UpdateExperimentProgressInput
  ): Promise<boolean> {
    await this.experimentManager.updateExperimentProgress(input);
    return true;
  }

  @Mutation(() => Boolean)
  async updateExperimentOptimizationResult(
    @Arg('input', () => UpdateExperimentOptimizationResultInput)
    input: UpdateExperimentOptimizationResultInput
  ): Promise<boolean> {
    await this.experimentManager.updateExperimentOptimizationResult(input);
    return true;
  }

  // #endregion Mutation
}
