/**
 * PWA 安装捕获(仅 Web)。`beforeinstallprompt` 可能在 React 挂载前触发,所以在入口(main.tsx
 * 的 Web 分支)尽早 initInstallCapture() 注册监听并把事件暂存,组件再通过 subscribe 取用。
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export function initInstallCapture(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // 阻止浏览器自带的迷你提示,改用我们自己的引导按钮
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const getDeferred = (): BeforeInstallPromptEvent | null => deferred;

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 触发系统安装框;无可用事件(浏览器不支持/已安装)返回 "unavailable"。 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome;
}

/** 是否以「已安装的独立应用」形态运行(任一独立显示模式或 iOS standalone)。 */
export function isRunningStandalone(): boolean {
  const mm = (q: string) => window.matchMedia?.(q).matches ?? false;
  return (
    mm("(display-mode: standalone)") ||
    mm("(display-mode: minimal-ui)") ||
    mm("(display-mode: window-controls-overlay)") ||
    mm("(display-mode: fullscreen)") ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
