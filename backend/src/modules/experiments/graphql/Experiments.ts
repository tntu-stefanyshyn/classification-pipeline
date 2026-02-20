import { Arg, Ctx, FieldResolver, ID, Mutation, Query, Resolver, Root } from 'type-graphql';
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
import { AuthFlow } from '../../auth/services/AuthFlow';
import type { GraphQLContext } from '../../../types/context';

@Resolver(() => Experiment)
export class Experiments {
  private readonly manager = new ExperimentManager();
  private readonly experimentManager = new ExperimentManager();
  private readonly graphManager = new GraphManager();
  private readonly workflowManager = new WorkflowManager();
  private readonly auth = new AuthFlow();

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
  async experiments(@Ctx() context: GraphQLContext): Promise<Experiment[]> {
    const user = await this.auth.me(context.req);
    return this.manager.list(user._id.toString());
  }

  @Query(() => Experiment, { nullable: true })
  async experiment(
    @Arg('_id', () => ID) _id: string,
    @Ctx() context: GraphQLContext
  ): Promise<Experiment | null> {
    const user = await this.auth.me(context.req);
    try {
      return await this.manager.getById(_id, user._id.toString());
    } catch {
      return null;
    }
  }
  // #endregion Query

  // #region Mutation
  @Mutation(() => Experiment)
  async createExperiment(
    @Arg('input', () => CreateExperimentInput) input: CreateExperimentInput,
    @Ctx() context: GraphQLContext
  ): Promise<Experiment> {
    const user = await this.auth.me(context.req);
    return this.manager.create(input, user._id.toString());
  }

  @Mutation(() => Experiment)
  async updateExperiment(
    @Arg('input', () => UpdateExperimentInput) input: UpdateExperimentInput,
    @Ctx() context: GraphQLContext
  ): Promise<Experiment> {
    const user = await this.auth.me(context.req);
    const experiment = await this.manager.update(input, user._id.toString());
    const hasConfigurationChanges =
      input.name !== undefined ||
      input.description !== undefined ||
      input.fileId !== undefined ||
      input.graphNodes !== undefined ||
      input.graphSettings !== undefined ||
      input.graphComputationMode !== undefined;
    if (hasConfigurationChanges) {
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
    @Arg('input', () => GenerateExperimentGraphInput) input: GenerateExperimentGraphInput,
    @Ctx() context: GraphQLContext
  ): Promise<Experiment> {
    const user = await this.auth.me(context.req);
    const experiment = await this.manager.generateGraph(input, user._id.toString());
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
    @Arg('input', () => ChangeExperimentStatusInput) input: ChangeExperimentStatusInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    return this.auth.me(context.req).then((user) => {
      return this.manager.getById(input.experimentId, user._id.toString()).then(() => {
        return this.experimentManager.changeStatus(input);
      });
    });
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
