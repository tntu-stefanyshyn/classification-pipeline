import type { GraphNode } from '../graphql';

export type GraphPath = {
  id: string;
  nodeIds: string[];
  label: string;
};

export const buildGraphPaths = (nodes: GraphNode[]): GraphPath[] => {
  if (!nodes || nodes.length === 0) return [];
  const ids = new Set(nodes.map((node) => node._id));
  const childrenByParent = new Map<string, string[]>();
  const nodeById = new Map(nodes.map((node) => [node._id, node]));

  nodes.forEach((node) => {
    const parentId = node.parentId ?? '';
    if (!parentId || !ids.has(parentId)) return;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(node._id);
    childrenByParent.set(parentId, list);
  });

  const roots = nodes
    .filter((node) => {
      const parentId = node.parentId ?? '';
      return !parentId || !ids.has(parentId);
    })
    .map((node) => node._id);

  if (roots.length === 0) return [];

  const paths: GraphPath[] = [];
  const visiting = new Set<string>();

  const buildLabel = (nodeIds: string[]) =>
    nodeIds
      .map((id) => {
        const node = nodeById.get(id);
        return node?.technology || node?.label || 'Unknown node';
      })
      .join(' -> ');

  const dfs = (nodeId: string, path: string[]) => {
    if (visiting.has(nodeId)) return;
    visiting.add(nodeId);
    const nextPath = [...path, nodeId];
    const children = childrenByParent.get(nodeId) ?? [];
    if (children.length === 0) {
      paths.push({
        id: nextPath.join('.'),
        nodeIds: nextPath,
        label: buildLabel(nextPath),
      });
      visiting.delete(nodeId);
      return;
    }
    children.forEach((childId) => dfs(childId, nextPath));
    visiting.delete(nodeId);
  };

  roots.forEach((rootId) => dfs(rootId, []));
  return paths;
};
