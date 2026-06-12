import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { ipc } from "../../lib/tauri-ipc";
import { buildExportMarkdown, parseImportMarkdown } from "../../lib/markdownIO";
import { f, t } from "../../lib/i18n";
import Modal from "../ui/Modal";

/** 导入导出 Markdown(对齐旧版 ☰ 菜单「导入导出」) */
export default function ImportExportDialog({ onClose }: { onClose: () => void }) {
  const pushToast = useAppStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    try {
      const { groups, tasks } = useAppStore.getState();
      const md = buildExportMarkdown(groups, tasks);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const name = `todo-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.md`;
      const path = await ipc.exportFile(name, md);
      pushToast(`${t("S.Export.Md")} ✓ ${path}`);
      onClose();
    } catch (e) {
      pushToast(String(e));
    }
  };

  const doImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const parsed = parseImportMarkdown(text);
      if (parsed.length === 0) {
        pushToast(t("S.Import.NoTasks"));
        return;
      }
      setBusy(true);
      try {
        const state = useAppStore.getState();
        // 分组名 → id(已存在同名标签直接复用,否则新建)
        const groupIdByName = new Map(state.groups.map((g) => [g.name, g.id]));
        // 每级缩进的最近一条任务 id,用于挂 parent(对齐旧版层级还原)
        const lastAtIndent: (string | null)[] = [];
        for (const p of parsed) {
          let groupId: string | undefined;
          if (p.group) {
            const exist = groupIdByName.get(p.group);
            if (exist) groupId = exist;
            else {
              const g = await ipc.createGroup(p.group);
              groupIdByName.set(g.name, g.id);
              groupId = g.id;
            }
          }
          const parentId = p.indent > 0 ? (lastAtIndent[p.indent - 1] ?? undefined) : undefined;
          const task = await ipc.createTask({
            title: p.title,
            group_id: groupId,
            parent_id: parentId,
            indent_level: parentId ? p.indent : 0,
          });
          if (p.completed) {
            await ipc.updateTask({
              id: task.id,
              is_completed: true,
              original_group_id: groupId ?? "",
            });
          }
          lastAtIndent[p.indent] = task.id;
          lastAtIndent.length = p.indent + 1;
        }
        // 整体回灌一次,保证顺序/层级与库一致
        const [tasks, groups] = await Promise.all([ipc.getTasks(), ipc.getGroups()]);
        useAppStore.setState({ tasks, groups });
        pushToast(f("S.Fmt.ImportDone", parsed.length));
        onClose();
      } catch (e) {
        pushToast(String(e));
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  return (
    <Modal title={t("S.ImportExport")} onClose={onClose} width={320}>
      <div className="flex flex-col gap-2">
        <button
          disabled={busy}
          onClick={() => void doExport()}
          className="flex items-center gap-2 rounded-lg bg-input px-3 py-2.5 text-sm text-text-1 ring-1 ring-divider hover:ring-accent disabled:opacity-50"
        >
          <Download size={15} className="text-accent" />
          {t("S.Export.Md")}
        </button>
        <button
          disabled={busy}
          onClick={doImport}
          className="flex items-center gap-2 rounded-lg bg-input px-3 py-2.5 text-sm text-text-1 ring-1 ring-divider hover:ring-accent disabled:opacity-50"
        >
          <Upload size={15} className="text-accent" />
          {t("S.Import.Md")}
        </button>
      </div>
    </Modal>
  );
}
