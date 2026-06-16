import { FileText, RotateCcw, Trash2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { f, t } from "../../lib/i18n";
import { confirm } from "../ui/ConfirmDialog";

/** 便签回收站:已软删除便签列表,可恢复 / 彻底删除 / 清空(物理删除,不自动清理)。 */
export default function NotesTrash() {
  const deletedNotes = useAppStore((s) => s.deletedNotes);
  const restoreNote = useAppStore((s) => s.restoreNote);
  const purgeNote = useAppStore((s) => s.purgeNote);
  const emptyNoteTrash = useAppStore((s) => s.emptyNoteTrash);

  const confirmPurge = async (id: string, title: string) => {
    if (await confirm({ title: t("S.X.NotePurge"), message: f("S.X.NotePurgeConfirm", title) })) {
      void purgeNote(id);
    }
  };
  const confirmEmpty = async () => {
    if (deletedNotes.length === 0) return;
    if (await confirm({ title: t("S.X.NoteTrashEmpty"), message: t("S.X.NoteTrashEmptyConfirm") })) {
      void emptyNoteTrash();
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-divider px-3 py-2">
        <span className="text-sm font-semibold text-text-1">{t("S.X.NoteTrash")}</span>
        <button
          disabled={deletedNotes.length === 0}
          onClick={() => void confirmEmpty()}
          className="rounded-md px-2 py-1 text-xs text-overdue ring-1 ring-divider hover:bg-card-hover disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {t("S.X.NoteTrashEmpty")}
        </button>
      </div>
      {deletedNotes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          {t("S.X.NoteTrashEmptyHint")}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {deletedNotes.map((n) => (
            <div
              key={n.id}
              className="group flex items-center gap-2 rounded-md border border-divider px-3 py-2"
            >
              <FileText size={14} className="shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-text-1">
                  {n.custom_title || n.title || t("S.X.UntitledNote")}
                </div>
                <div className="truncate text-xs text-muted">
                  {f("S.X.NoteDeletedAt", n.deleted_at ?? "")}
                </div>
              </div>
              <button
                title={t("S.X.NoteRestore")}
                onClick={() => void restoreNote(n.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-card-hover hover:text-accent"
              >
                <RotateCcw size={14} />
              </button>
              <button
                title={t("S.X.NotePurge")}
                onClick={() => void confirmPurge(n.id, n.custom_title || n.title || t("S.X.UntitledNote"))}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-card-hover hover:text-overdue"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
