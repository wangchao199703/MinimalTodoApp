import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

/**
 * 把一个列表项同时注册为拖拽源和释放目标(原生 HTML5 拖放,零运行时开销)。
 * type 用于隔离不同列表(任务/标签/看板列),释放命中时高亮 closestEdge 指示线。
 */
export function useSortableItem<T extends HTMLElement>(
  type: string,
  id: string,
  axis: "vertical" | "horizontal" = "vertical",
  /** 返回 false 时禁止拖拽(如行内重命名编辑期间);用 ref 持最新值,不触发重订阅 */
  canDrag?: () => boolean,
) {
  const ref = useRef<T | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const canDragRef = useRef(canDrag);
  canDragRef.current = canDrag;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const allowedEdges: Edge[] = axis === "vertical" ? ["top", "bottom"] : ["left", "right"];
    return combine(
      draggable({
        element: el,
        canDrag: () => (canDragRef.current ? canDragRef.current() : true),
        getInitialData: () => ({ type, id }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => source.data.type === type && source.data.id !== id,
        getData: ({ input, element }) =>
          attachClosestEdge({ type, id }, { input, element, allowedEdges }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    );
  }, [type, id, axis]);

  return { ref, isDragging, closestEdge };
}
