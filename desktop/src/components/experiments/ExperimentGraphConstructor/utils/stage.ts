import type { ClassificationStage } from '../graphql';
import { classificationStages, stageLabels } from '../constants/stages';

export const getStageLabel = (stage?: ClassificationStage | null) =>
  stage && stageLabels[stage] ? stageLabels[stage] : 'Етап не вказано';

export const isClassificationStage = (value: string): value is ClassificationStage =>
  classificationStages.some((stage) => stage === value);
