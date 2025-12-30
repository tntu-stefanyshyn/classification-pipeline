import { ExperimentRunInfoQuery } from '../../graphql/queries/generated/ExperimentRunInfo';

export interface ResultViewProps {
  experimentRun: Exclude<ExperimentRunInfoQuery['experimentRun'], undefined | null>;
}
