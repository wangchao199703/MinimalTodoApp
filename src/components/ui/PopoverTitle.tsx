import type { ReactNode } from "react";

/** 上拉框/弹框统一标题:标明当前弹框选的是什么(置于滚动区之外,不随列表滚走) */
export default function PopoverTitle({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-divider px-2.5 py-1.5 text-[11px] font-medium text-muted">
      {children}
    </p>
  );
}
