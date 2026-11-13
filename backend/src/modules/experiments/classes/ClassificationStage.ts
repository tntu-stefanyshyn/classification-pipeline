import { registerEnumType } from 'type-graphql';

export enum ClassificationStage {
  PREPROCESSING = 'PREPROCESSING',
  DATA_ENHANCEMENT = 'DATA_ENHANCEMENT',
  FEATURE_EXTRACTION = 'FEATURE_EXTRACTION',
  DIMENSIONALITY_REDUCTION = 'DIMENSIONALITY_REDUCTION',
  CLASSIFICATION = 'CLASSIFICATION',
}

registerEnumType(ClassificationStage, {
  name: 'ClassificationStage',
  description:
    'Stage of a classification pipeline. Stages run in the order listed; a path ends with classification.',
  valuesConfig: {
    PREPROCESSING: { description: 'Preprocessing of the data.' },
    DATA_ENHANCEMENT: { description: 'Data enhancement, for example artifact suppression.' },
    FEATURE_EXTRACTION: { description: 'Feature extraction, for example ICA.' },
    DIMENSIONALITY_REDUCTION: { description: 'Dimensionality reduction, for example PCA.' },
    CLASSIFICATION: {
      description: 'Classification: the classifier is trained and evaluated with cross-validation.',
    },
  },
});

export const CLASSIFICATION_STAGE_VALUES: ClassificationStage[] = [
  ClassificationStage.PREPROCESSING,
  ClassificationStage.DATA_ENHANCEMENT,
  ClassificationStage.FEATURE_EXTRACTION,
  ClassificationStage.DIMENSIONALITY_REDUCTION,
  ClassificationStage.CLASSIFICATION,
];
