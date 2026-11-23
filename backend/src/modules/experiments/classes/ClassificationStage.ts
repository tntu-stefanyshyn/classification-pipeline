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
    'Stage of a classification pipeline. The stages run in this order: PREPROCESSING, DATA_ENHANCEMENT, FEATURE_EXTRACTION, DIMENSIONALITY_REDUCTION, CLASSIFICATION. A path ends with classification. The schema lists the values alphabetically.',
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
