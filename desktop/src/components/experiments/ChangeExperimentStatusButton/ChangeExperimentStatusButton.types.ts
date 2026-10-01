import { ExperimentStatus } from '../ExperimentGraphConstructor';

export interface ChangeExperimentStatusButtonProps {
  label: string;
  status: ExperimentStatus;
  disabled?: boolean;
}
