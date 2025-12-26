import { registerEnumType } from 'type-graphql';

export enum ClassificationStage {
  PREPROCESSING = 'PREPROCESSING',
  DATA_ENHANCEMENT = 'DATA_ENHANCEMENT',
  FEATURE_EXTRACTION = 'FEATURE_EXTRACTION',
  DIMENSIONALITY_REDUCTION = 'DIMENSIONALITY_REDUCTION',
  CLASSIFICATION = 'CLASSIFICATION',
}

registerEnumType(ClassificationStage, { name: 'ClassificationStage' });

export const CLASSIFICATION_STAGE_VALUES: ClassificationStage[] = [
  ClassificationStage.PREPROCESSING,
  ClassificationStage.DATA_ENHANCEMENT,
  ClassificationStage.FEATURE_EXTRACTION,
  ClassificationStage.DIMENSIONALITY_REDUCTION,
  ClassificationStage.CLASSIFICATION,
];
