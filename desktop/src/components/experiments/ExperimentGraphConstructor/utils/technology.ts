import type { ClassificationStage, Technology } from '../graphql';
import type { TechnologyIndex } from '../ExperimentGraphConstructor.types';
import type { AppLocale } from '../../../../i18n';
import { getLocalizedTechnologyLabel } from '../../../../utils/technologyLabel';

const DISPLAY_NAME_SEPARATOR = ' / ';

export const getTechnologyStorageLabel = (
  technology?: Pick<Technology, 'displayName' | 'name'> | null
) => {
  const displayName = technology?.displayName?.trim();
  return displayName || technology?.name || '';
};

const getTechnologyAliases = (technology: Pick<Technology, 'displayName' | 'name'>) => {
  const aliases = new Set<string>();
  const addAlias = (value?: string | null) => {
    const normalizedValue = value?.trim() ?? '';
    if (normalizedValue) aliases.add(normalizedValue);
  };

  addAlias(technology.name);
  addAlias(technology.displayName);

  const displayName = technology.displayName?.trim() ?? '';
  if (displayName.includes(DISPLAY_NAME_SEPARATOR)) {
    displayName
      .split(DISPLAY_NAME_SEPARATOR)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(addAlias);
  }

  return Array.from(aliases);
};

export const getTechnologyDisplayName = (
  technology?: Pick<Technology, 'displayName' | 'name'> | null,
  locale: AppLocale = 'uk'
) => {
  return getLocalizedTechnologyLabel(getTechnologyStorageLabel(technology), locale);
};

export const buildTechnologyIndex = (
  technologies: Technology[],
  locale: AppLocale = 'uk'
): TechnologyIndex => {
  const byStage = new Map<ClassificationStage, Technology[]>();
  const byStageName = new Map<string, Technology>();
  const byStageAlias = new Map<string, Technology>();

  technologies.forEach((technology) => {
    const list = byStage.get(technology.stage) ?? [];
    list.push(technology);
    byStage.set(technology.stage, list);
    byStageName.set(`${technology.stage}:${technology.name}`, technology);
    getTechnologyAliases(technology).forEach((alias) => {
      const key = `${technology.stage}:${alias}`;
      if (!byStageAlias.has(key)) {
        byStageAlias.set(key, technology);
      }
    });
  });

  byStage.forEach((list) => {
    list.sort((left, right) =>
      getTechnologyDisplayName(left, locale).localeCompare(getTechnologyDisplayName(right, locale))
    );
  });

  return { byStage, byStageName, byStageAlias };
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
    const match =
      index.byStageName.get(`${stage}:${candidate}`) ??
      index.byStageAlias.get(`${stage}:${candidate}`);
    if (match) return match;
  }
  return getDefaultTechnologyForStage(index, stage);
};
