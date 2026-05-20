import { ClassificationStage } from '../graphql';
import { getMessages, localeService } from '../../../../i18n';

export const classificationStages: ClassificationStage[] = [
  ClassificationStage.PREPROCESSING,
  ClassificationStage.DATA_ENHANCEMENT,
  ClassificationStage.FEATURE_EXTRACTION,
  ClassificationStage.DIMENSIONALITY_REDUCTION,
  ClassificationStage.CLASSIFICATION,
];

export const getStageLabels = (locale = localeService.getLocale()) =>
  getMessages(locale).graph.stages;
