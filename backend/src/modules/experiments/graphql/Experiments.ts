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
  @FieldResolver(() => GraphStructure, {
    nullable: true,
    description: 'The graph of the experiment.',
  })
  graph(@Root() experiment: Experiment): Promise<GraphStructure | null> {
    return this.graphManager.getByExperimentId(experiment._id);
  }

  @FieldResolver(() => ExperimentStatus, {
    nullable: true,
    description: 'Current status of the experiment.',
  })
  async status(@Root() { _id }: Experiment) {
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: _id,
      type: WorkflowType.EXPERIMENT,
    });
    return workflow.status;
  }
  // #endregion FieldResolver

  // #region Query
  @Query(() => [Experiment], { description: 'The experiments of the signed-in user.' })
  async experiments(@Ctx() context: GraphQLContext): Promise<Experiment[]> {
    const user = await this.auth.me(context.req);
    return this.manager.list(user._id.toString());
  }

  @Query(() => Experiment, {
    nullable: true,
    description:
      'One experiment by id. Returns `null` when it does not exist or belongs to another user. A worker (service token) can read any experiment.',
  })
  async experiment(
    @Arg('_id', () => ID, { description: 'Id of the experiment.' }) _id: string,
    @Ctx() context: GraphQLContext
  ): Promise<Experiment | null> {
    const user = this.auth.isService(context.req) ? null : await this.auth.me(context.req);
    try {
      return await this.manager.getById(_id, user?._id.toString());
    } catch {
      return null;
    }
  }
  // #endregion Query

  // #region Mutation
  @Mutation(() => Experiment, {
    description: 'Creates an experiment with an empty graph for the signed-in user.',
  })
  async createExperiment(
    @Arg('input', () => CreateExperimentInput, {
      description: 'Name, optional description and optional file.',
    })
    input: CreateExperimentInput,
    @Ctx() context: GraphQLContext
  ): Promise<Experiment> {
    const user = await this.auth.me(context.req);
    return this.manager.create(input, user._id.toString());
  }

  @Mutation(() => Experiment, {
    description:
      'Changes the name, description, file, graph nodes, graph settings or computation mode. Rejected once computations have started, except for attaching a file to an experiment that has none.',
  })
  async updateExperiment(
    @Arg('input', () => UpdateExperimentInput, {
      description: 'The experiment id and the fields to change.',
    })
    input: UpdateExperimentInput,
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
        const lockedStatuses = [
          ExperimentStatus.computing,
          ExperimentStatus.optimization,
          ExperimentStatus.completed,
        ];
        if (!lockedStatuses.some((status) => status === workflow.status)) {
          await this.experimentManager.changeStatus({
            experimentId: input._id,
            status: ExperimentStatus.configuring,
          });
        }
      }
    }
    return experiment;
  }

  @Mutation(() => Experiment, {
    description:
      'Builds the graph from the technologies chosen per stage, replacing the current nodes. `CLASSIFICATION` must have at least one technology.',
  })
  async generateExperimentGraph(
    @Arg('input', () => GenerateExperimentGraphInput, {
      description: 'The experiment id and the technologies per stage.',
    })
    input: GenerateExperimentGraphInput,
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

  @Mutation(() => Boolean, {
    description:
      'Moves the experiment along the allowed status transitions. Moving to `computing` checks the dataset file and generates the pipelines.',
  })
  changeExperimentStatus(
    @Arg('input', () => ChangeExperimentStatusInput, {
      description: 'The experiment id and the status to move to.',
    })
    input: ChangeExperimentStatusInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    return this.auth.me(context.req).then((user) => {
      return this.manager.getById(input.experimentId, user._id.toString()).then(() => {
        return this.experimentManager.changeStatus(input);
      });
    });
  }

  @Mutation(() => Boolean, {
    description: 'Reports the progress of the optimization. Worker operation (service token).',
  })
  async updateExperimentProgress(
    @Arg('input', () => UpdateExperimentProgressInput, {
      description: 'The experiment id, progress, message and optimization status.',
    })
    input: UpdateExperimentProgressInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    this.auth.requireService(context.req);
    await this.experimentManager.updateExperimentProgress(input);
    return true;
  }

  @Mutation(() => Boolean, {
    description: 'Stores the best pipeline and its score. Worker operation (service token).',
  })
  async updateExperimentOptimizationResult(
    @Arg('input', () => UpdateExperimentOptimizationResultInput, {
      description: 'The experiment id, the best pipeline and its score.',
    })
    input: UpdateExperimentOptimizationResultInput,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
    this.auth.requireService(context.req);
    await this.experimentManager.updateExperimentOptimizationResult(input);
    return true;
  }

  // #endregion Mutation
}
