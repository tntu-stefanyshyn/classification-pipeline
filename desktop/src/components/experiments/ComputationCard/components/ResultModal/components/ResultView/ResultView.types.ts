import { PipelineInfoQuery } from '../../graphql/queries/generated/ExperimentRunInfo';

export interface ResultViewProps {
  pipeline: Exclude<PipelineInfoQuery['pipeline'], undefined | null>;
}
