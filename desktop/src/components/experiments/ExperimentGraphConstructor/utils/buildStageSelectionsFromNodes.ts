import { classificationStages } from '../constants/stages';
import type {
  FlatGraphNode,
  StageSelection,
  TechnologyIndex,
} from '../ExperimentGraphConstructor.types';
import { resolveTechnology } from './technology';

export const buildStageSelectionsFromNodes = (
  nodes: FlatGraphNode[],
  technologyIndex: TechnologyIndex
): StageSelection => {
  const selections = new Map<string, Set<string>>();

  nodes.forEach((node) => {
    if (!node.stage) return;
    const technology = resolveTechnology(technologyIndex, node.stage, node.technology, node.label);
    if (!technology) return;
    const stageKey = node.stage;
    const set = selections.get(stageKey) ?? new Set<string>();
    set.add(technology._id);
    selections.set(stageKey, set);
  });

  const result: StageSelection = {};
  classificationStages.forEach((stage) => {
    const set = selections.get(stage);
    if (!set || set.size === 0) return;
    result[stage] = Array.from(set);
  });

  return result;
};
