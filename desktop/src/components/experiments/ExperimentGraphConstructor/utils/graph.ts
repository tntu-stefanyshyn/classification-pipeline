import type { FlatGraphNode } from '../ExperimentGraphConstructor.types';

export const collectDescendantIds = (nodes: FlatGraphNode[], rootId: string) => {
  const childrenByParent = new Map<string, string[]>();
  nodes.forEach((node) => {
    if (!node.parentId) return;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node._id);
    childrenByParent.set(node.parentId, list);
  });

  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || ids.has(current)) continue;
    ids.add(current);
    const children = childrenByParent.get(current);
    if (children) {
      stack.push(...children);
    }
  }
  return ids;
};

export const getGraphSignature = (nodes: FlatGraphNode[]): string => {
  const normalizeSettings = (settings?: Record<string, string>) => {
    if (!settings) return '';
    return Object.keys(settings)
      .sort()
      .map((key) => `${key}:${settings[key]}`)
      .join(',');
  };

  return nodes
    .map((node) => {
      const stage = node.stage ?? '';
      const parent = node.parentId ?? '';
      const tech = node.technology ?? '';
      const type = node.type ?? '';
      return `${node._id}:${parent}:${stage}:${tech}:${type}:${normalizeSettings(node.settings)}`;
    })
    .join('|');
};
