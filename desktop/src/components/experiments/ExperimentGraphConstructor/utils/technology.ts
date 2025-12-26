import type { ClassificationStage, Technology } from '../graphql';
import type { TechnologyIndex } from '../ExperimentGraphConstructor.types';

export const buildTechnologyIndex = (technologies: Technology[]): TechnologyIndex => {
  const byStage = new Map<ClassificationStage, Technology[]>();
  const byStageName = new Map<string, Technology>();

  technologies.forEach((technology) => {
    const list = byStage.get(technology.stage) ?? [];
    list.push(technology);
    byStage.set(technology.stage, list);
    byStageName.set(`${technology.stage}:${technology.name}`, technology);
  });

  byStage.forEach((list) => {
    list.sort((left, right) => left.name.localeCompare(right.name));
  });

  return { byStage, byStageName };
};

export const getDefaultTechnologyForStage = (
  index: TechnologyIndex,
  stage: ClassificationStage
): Technology | null => {
  const list = index.byStage.get(stage);
  return list && list.length > 0 ? list[0] : null;
};

export const resolveTechnology = (
  index: TechnologyIndex,
  stage: ClassificationStage,
  technology?: string | null,
  label?: string | null
): Technology | null => {
  const trimmedTechnology = technology?.trim() ?? '';
  const trimmedLabel = label?.trim() ?? '';
  const candidate = trimmedTechnology || trimmedLabel;
  if (candidate) {
    const match = index.byStageName.get(`${stage}:${candidate}`);
    if (match) return match;
  }
  return getDefaultTechnologyForStage(index, stage);
};
