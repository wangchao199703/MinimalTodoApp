import { t } from "../../lib/i18n";
import Modal from "../ui/Modal";

/** 各节标题键与行数(对齐旧版 HelpDialog;略去新版不存在的「语音输入」与过时的主题选择窗描述) */
const SECTIONS: { titleKey: string; lines: number }[] = [
  { titleKey: "S.Help.Tasks.Title", lines: 8 },
  { titleKey: "S.Help.Subtasks.Title", lines: 3 },
  { titleKey: "S.Help.Schedule.Title", lines: 4 },
  { titleKey: "S.Help.Reminder.Title", lines: 3 },
  { titleKey: "S.Help.IO.Title", lines: 3 },
  { titleKey: "S.Help.Dock.Title", lines: 3 },
  { titleKey: "S.Help.Group.Title", lines: 4 },
  { titleKey: "S.Help.Theme.Title", lines: 4 },
  { titleKey: "S.Help.Window.Title", lines: 4 },
  { titleKey: "S.Help.Update.Title", lines: 3 },
  { titleKey: "S.Help.Contact.Title", lines: 1 },
];

/** 使用说明(对齐旧版 HelpDialog,词典 S.Help.* 全套键) */
export default function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title={t("S.Help.Title")}
      onClose={onClose}
      width={520}
      footer={
        <button
          onClick={onClose}
          className="rounded-md bg-accent px-3.5 py-1.5 text-xs text-on-accent hover:opacity-90"
        >
          {t("S.Help.Ok")}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {SECTIONS.map((sec) => {
          const prefix = sec.titleKey.replace(/\.Title$/, "");
          return (
            <section key={sec.titleKey}>
              <h3 className="mb-1.5 text-sm font-semibold text-text-1">{t(sec.titleKey)}</h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-text-2">
                {Array.from({ length: sec.lines }, (_, i) => (
                  <li key={i}>{t(`${prefix}.L${i + 1}`)}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
