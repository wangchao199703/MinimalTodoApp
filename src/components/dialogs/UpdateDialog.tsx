import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { downloadAndApply, openDownloadUrl, type UpdateInfo } from "../../lib/updater";
import { t, f } from "../../lib/i18n";
import Modal from "../ui/Modal";
import MarkdownLite from "../ui/MarkdownLite";

export default function UpdateDialog(props: { info: UpdateInfo; onClose: () => void }) {
  const saveSetting = useAppStore((s) => s.saveSetting);
  const pushToast = useAppStore((s) => s.pushToast);
  const [progress, setProgress] = useState<number | null>(null);
  const [failMsg, setFailMsg] = useState<string>("");

  const start = async () => {
    setFailMsg("");
    setProgress(0);
    try {
      await downloadAndApply(props.info, setProgress);
      // 成功后应用会退出重启,走不到这里
    } catch (e) {
      setProgress(null);
      // 设置窗口无 Toast 宿主,失败必须在对话框内可见;附带真实原因便于定位
      setFailMsg(String((e as Error)?.message ?? e) || t("S.Update.DownloadFailed"));
      pushToast(t("S.Update.DownloadFailed"));
    }
  };

  const reinstall = props.info.reinstall === true;

  return (
    <Modal
      title={reinstall ? t("S.Settings.Reinstall") : t("S.Update.Title")}
      onClose={props.onClose}
      width={400}
    >
      <p className="text-sm font-medium text-text-1">
        {reinstall
          ? f("S.Update.Reinstall", props.info.version)
          : f("S.Update.NewVersion", props.info.version, props.info.currentVersion)}
      </p>

      {props.info.notes && (
        <>
          <p className="mt-2 mb-1 text-xs font-medium text-muted">{t("S.Update.WhatsNew")}</p>
          <MarkdownLite
            text={props.info.notes}
            className="max-h-44 overflow-y-auto rounded-md bg-input p-2 text-xs text-text-2 select-text"
          />
        </>
      )}

      {progress !== null ? (
        <div className="mt-3">
          <p className="mb-1 text-xs text-text-2">{t("S.Update.Downloading")}</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-divider">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          {/* 失败原因:完整换行展示(设置窗无 Toast 宿主),不再省略号 + tooltip */}
          {failMsg && (
            <p className="mt-3 rounded-md bg-input p-2 text-xs break-words whitespace-pre-wrap text-red-500">
              {t("S.Update.DownloadFailed")}:{failMsg}
            </p>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            {/* 重装当前版本时无「跳过此版本」语义,只保留取消 + 立即重装 */}
          {!reinstall && (
            <button
              onClick={() => {
                saveSetting("ignored_update_version", props.info.version);
                props.onClose();
              }}
              className="rounded-md px-2.5 py-1.5 text-xs text-muted hover:bg-card-hover"
            >
              {t("S.Update.SkipThis")}
            </button>
          )}
          {/* 手动下载:用默认浏览器打开下载地址自行下载(应用内更新失败时的兜底) */}
          <button
            onClick={() => void openDownloadUrl(props.info.assetUrl)}
            className="rounded-md px-2.5 py-1.5 text-xs text-text-2 hover:bg-card-hover"
          >
            {t("S.Update.ManualDownload")}
          </button>
          {/* 关闭按钮去掉:右上角叉号已可关闭(点叉=不更新/不重装) */}
          <button
            onClick={() => void start()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90"
          >
            {reinstall ? t("S.Settings.ReinstallBtn") : t("S.Update.Now")}
          </button>
          </div>
        </>
      )}
    </Modal>
  );
}
