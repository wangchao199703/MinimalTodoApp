import { useEffect, useState } from "react";
import { ArrowUp, Download, MonitorDown, X } from "lucide-react";
import { getDeferred, isRunningStandalone, promptInstall, subscribe } from "../../lib/pwaInstall";
import { t } from "../../lib/i18n";

/** localStorage 标记(按 origin 持久,天然只对本网址生效);"1" = 用户已勾「不再弹出」 */
const KEY = "mt-install-guide-dismissed";

/**
 * PWA 安装引导(仅 Web 浏览器态由 App 用 `{!isTauri && <InstallGuide/>}` 挂载)。
 * 行为:浏览器标签里默认弹;关闭(X)=仅本次,下次仍弹;勾「不再弹出」=写 localStorage 永久不弹;
 * 已安装/独立运行(standalone)永不弹。支持的浏览器给一键安装按钮,否则回退「点地址栏图标」图文。
 */
export default function InstallGuide() {
  const [visible, setVisible] = useState(
    () => !isRunningStandalone() && localStorage.getItem(KEY) !== "1",
  );
  const [installable, setInstallable] = useState(() => !!getDeferred());

  useEffect(() => {
    return subscribe(() => {
      setInstallable(!!getDeferred());
      if (isRunningStandalone()) setVisible(false); // appinstalled 后隐藏
    });
  }, []);

  if (!visible) return null;

  const onCheckbox = (checked: boolean) => {
    if (checked) {
      localStorage.setItem(KEY, "1");
      setVisible(false);
    } else {
      localStorage.removeItem(KEY);
    }
  };
  const onInstall = async () => {
    if ((await promptInstall()) === "accepted") setVisible(false);
  };

  return (
    <div className="toast-in fixed top-14 left-1/2 z-[250] w-[min(94vw,480px)] -translate-x-1/2 rounded-2xl bg-accent p-6 text-on-accent shadow-2xl ring-1 ring-black/10">
      <button
        title={t("S.X.PwaInstall.Close")}
        onClick={() => setVisible(false)}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-on-accent/80 hover:bg-white/20 hover:text-on-accent"
      >
        <X size={18} />
      </button>

      <div className="flex items-start gap-4 pr-6">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 text-on-accent">
          <MonitorDown size={30} />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-semibold text-on-accent">{t("S.X.PwaInstall.Title")}</p>
          <p className="mt-1.5 flex items-start gap-1.5 text-sm leading-relaxed text-on-accent/90">
            {!installable && <ArrowUp size={16} className="mt-0.5 shrink-0" />}
            <span>{installable ? t("S.X.PwaInstall.Desc") : t("S.X.PwaInstall.AddressBarHint")}</span>
          </p>
        </div>
      </div>

      {installable && (
        <button
          onClick={() => void onInstall()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-base font-semibold text-accent shadow-sm hover:bg-white/90"
        >
          <Download size={19} />
          {t("S.X.PwaInstall.Button")}
        </button>
      )}

      <label className="mt-4 flex cursor-pointer select-none items-center gap-2 text-sm text-on-accent/85">
        <input
          type="checkbox"
          onChange={(e) => onCheckbox(e.target.checked)}
          className="h-4 w-4 accent-white"
        />
        {t("S.X.PwaInstall.DontShow")}
      </label>
    </div>
  );
}
