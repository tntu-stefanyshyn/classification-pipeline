import { DEFAULT_NODE_TYPE, DEFAULT_STAGE } from '../constants/graph';
import type { FlatGraphNode, TechnologyIndex } from '../ExperimentGraphConstructor.types';
import type { GraphNode } from '../graphql';
import type { AppLocale } from '../../../../i18n';
import { buildSettingsMap } from './settings';
import { getTechnologyDisplayName, resolveTechnology } from './technology';

export const normalizeGraphNodes = (
  nodes: GraphNode[],
  technologyIndex: TechnologyIndex,
  locale: AppLocale = 'uk'
): FlatGraphNode[] =>
  nodes.map((node) => {
    const stage = node.stage ?? DEFAULT_STAGE;
    const resolvedTechnology = resolveTechnology(
      technologyIndex,
      stage,
      node.technology,
      node.label
    );
    const technologyName = resolvedTechnology?.name ?? node.technology ?? node.label ?? '';
    const label =
      getTechnologyDisplayName(resolvedTechnology, locale) || node.label || node.technology || '';
    const settings = buildSettingsMap(resolvedTechnology?.settings, node.settings);
    return {
      _id: node._id,
      label,
      technology: technologyName,
      stage,
      type: node.type ?? DEFAULT_NODE_TYPE,
      settings,
      parentId: node.parentId ?? null,
    };
  });
