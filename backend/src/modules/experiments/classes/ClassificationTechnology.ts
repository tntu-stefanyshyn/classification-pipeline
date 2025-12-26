import { ClassificationStage } from './ClassificationStage';

export const CLASSIFICATION_TECHNOLOGIES: Record<ClassificationStage, readonly string[]> = {
  [ClassificationStage.PREPROCESSING]: ['CSP'],
  [ClassificationStage.DATA_ENHANCEMENT]: ['приглушення короткочасних артефактів'],
  [ClassificationStage.FEATURE_EXTRACTION]: ['ICA'],
  [ClassificationStage.DIMENSIONALITY_REDUCTION]: ['PCA'],
  [ClassificationStage.CLASSIFICATION]: ['SVM', 'CNN'],
};

export const getDefaultTechnology = (stage: ClassificationStage): string => {
  const options = CLASSIFICATION_TECHNOLOGIES[stage];
  return options[0] ?? '';
};

export const isTechnologyAllowed = (stage: ClassificationStage, value: string): boolean => {
  const options = CLASSIFICATION_TECHNOLOGIES[stage];
  return options.includes(value);
};
