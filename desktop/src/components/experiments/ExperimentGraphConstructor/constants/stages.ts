import { ClassificationStage } from '../graphql';

export const classificationStages: ClassificationStage[] = [
  ClassificationStage.PREPROCESSING,
  ClassificationStage.DATA_ENHANCEMENT,
  ClassificationStage.FEATURE_EXTRACTION,
  ClassificationStage.DIMENSIONALITY_REDUCTION,
  ClassificationStage.CLASSIFICATION,
];

export const stageLabels: Record<ClassificationStage, string> = {
  [ClassificationStage.PREPROCESSING]: 'Попередня обробка',
  [ClassificationStage.DATA_ENHANCEMENT]: 'Покращення даних',
  [ClassificationStage.FEATURE_EXTRACTION]: 'Видобування ознак',
  [ClassificationStage.DIMENSIONALITY_REDUCTION]: 'Зменшення розмірності',
  [ClassificationStage.CLASSIFICATION]: 'Класифікація',
};
