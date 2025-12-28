import type { GraphNode } from '../classes/GraphNode';

export const buildGraphPaths = (nodes: GraphNode[]): string[][] => {
  if (!nodes || nodes.length === 0) return [];
  const ids = new Set(nodes.map((node) => String(node._id)));
  const childrenByParent = new Map<string, string[]>();

  nodes.forEach((node) => {
    const nodeId = String(node._id);
    const parentId = node.parentId ? String(node.parentId) : '';
    if (!parentId || !ids.has(parentId)) return;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(nodeId);
    childrenByParent.set(parentId, list);
  });

  const roots = nodes
    .filter((node) => {
      const parentId = node.parentId ? String(node.parentId) : '';
      return !parentId || !ids.has(parentId);
    })
    .map((node) => String(node._id));

  if (roots.length === 0) return [];

  const paths: string[][] = [];
  const visiting = new Set<string>();

  const dfs = (nodeId: string, path: string[]) => {
    if (visiting.has(nodeId)) return;
    visiting.add(nodeId);
    const nextPath = [...path, nodeId];
    const children = childrenByParent.get(nodeId) ?? [];
    if (children.length === 0) {
      paths.push(nextPath);
      visiting.delete(nodeId);
      return;
    }
    children.forEach((childId) => dfs(childId, nextPath));
    visiting.delete(nodeId);
  };

  roots.forEach((rootId) => dfs(rootId, []));
  return paths;
};
