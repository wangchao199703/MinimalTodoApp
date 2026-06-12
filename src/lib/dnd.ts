import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

/**
 * 列表重排:把 sourceId 移动到 targetId 的上方/下方,返回新的 id 顺序。
 * allIds 是全局顺序;可见列表是其过滤子集,两个 id 都在全局序列里,结果天然正确。
 */
export function reorderIds(
  allIds: string[],
  sourceId: string,
  targetId: string,
  edge: Edge | null,
): string[] {
  if (sourceId === targetId) return allIds;
  const without = allIds.filter((id) => id !== sourceId);
  let idx = without.indexOf(targetId);
  if (idx === -1) return allIds;
  if (edge === "bottom") idx += 1;
  without.splice(idx, 0, sourceId);
  return without;
}
