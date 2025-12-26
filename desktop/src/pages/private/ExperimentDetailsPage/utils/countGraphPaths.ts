import type { GraphNode } from '../graphql';

export const countGraphPaths = (nodes: GraphNode[]): number => {
  if (nodes.length === 0) return 0;
  const ids = new Set(nodes.map((node) => node._id));
  const childrenByParent = new Map<string, string[]>();

  nodes.forEach((node) => {
    if (!node.parentId || !ids.has(node.parentId)) return;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node._id);
    childrenByParent.set(node.parentId, list);
  });

  const roots = nodes.filter((node) => !node.parentId || !ids.has(node.parentId));
  if (roots.length === 0) return 0;

  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const dfs = (id: string): number => {
    if (visiting.has(id)) return 0;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    visiting.add(id);
    const children = childrenByParent.get(id) ?? [];
    let paths = 0;
    if (children.length === 0) {
      paths = 1;
    } else {
      children.forEach((childId) => {
        paths += dfs(childId);
      });
    }
    visiting.delete(id);
    memo.set(id, paths);
    return paths;
  };

  let pathsCount = 0;
  roots.forEach((root) => {
    pathsCount += dfs(root._id);
  });

  return pathsCount;
};
