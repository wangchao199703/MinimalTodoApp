import { useState } from "react";
import { Plus } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export default function QuickAdd() {
  const view = useAppStore((s) => s.view);
  const addTask = useAppStore((s) => s.addTask);
  const [text, setText] = useState("");

  if (view.kind === "completed") return null;

  const submit = () => {
    const title = text.trim();
    if (!title) return;
    setText("");
    void addTask(title);
  };

  return (
    <div className="shrink-0 border-t border-divider bg-titlebar p-2.5">
      <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2 ring-1 ring-divider focus-within:ring-accent">
        <Plus size={15} className="shrink-0 text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="添加待办,回车确认"
          className="min-w-0 flex-1 bg-transparent text-sm text-text-1 outline-none placeholder:text-muted"
        />
      </div>
    </div>
  );
}
