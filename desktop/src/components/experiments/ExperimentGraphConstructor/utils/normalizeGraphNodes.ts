import { DEFAULT_NODE_TYPE, DEFAULT_STAGE } from '../constants/graph';
import type { FlatGraphNode, TechnologyIndex } from '../ExperimentGraphConstructor.types';
import type { GraphNode } from '../graphql';
import { buildSettingsMap } from './settings';
import { resolveTechnology } from './technology';

export const normalizeGraphNodes = (
  nodes: GraphNode[],
  technologyIndex: TechnologyIndex
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
    const settings = buildSettingsMap(resolvedTechnology?.settings, node.settings);
    return {
      _id: node._id,
      label: technologyName,
      technology: technologyName,
      stage,
      type: node.type ?? DEFAULT_NODE_TYPE,
      settings,
      parentId: node.parentId ?? null,
    };
  });
