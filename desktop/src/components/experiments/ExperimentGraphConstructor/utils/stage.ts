import type { ClassificationStage } from '../graphql';
import { classificationStages, getStageLabels } from '../constants/stages';
import { getMessages, localeService } from '../../../../i18n';

export const getStageLabel = (stage?: ClassificationStage | null) =>
  stage && getStageLabels()[stage]
    ? getStageLabels()[stage]
    : getMessages(localeService.getLocale()).graph.stageNotSpecified;

export const isClassificationStage = (value: string): value is ClassificationStage =>
  classificationStages.some((stage) => stage === value);
