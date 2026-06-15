// 更新检查与下载(前端侧):GitHub releases/latest 轮询 + SemVer 三段比对,
// 下载便携 exe 后把字节交给 Rust 的 apply_update 完成换壳重启。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { useAppStore } from "../store/useAppStore";
import { t } from "./i18n";

const REPO_SLUG = "wangchao199703/MinimalTodoApp";
const RELEASES_LATEST =
  `https://api.github.com/repos/${REPO_SLUG}/releases/latest`;

export interface UpdateInfo {
  version: string;
  notes: string;
  assetUrl: string;
  assetName: string;
  currentVersion: string;
  /** true 表示「重新安装当前版本」(同版本重装,非升级),UI 据此切换文案/隐藏跳过按钮 */
  reinstall?: boolean;
}

interface GithubRelease {
  tag_name?: string;
  body?: string;
  assets?: { name: string; browser_download_url: string }[];
}

/** 从一个 Release 选出可下载的便携 exe 资产(末尾 .exe);无则 null */
function pickExeAsset(release: GithubRelease) {
  return (release.assets ?? []).find((a) => a.name.toLowerCase().endsWith(".exe"));
}

/** "v1.2.3" / "1.2.3" → [1,2,3];解析失败返回 null */
function parseSemver(tag: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function newer(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/**
 * 检查更新。manual=false 时尊重 auto_update_enabled 与 ignored_update_version;
 * 返回 null 表示无更新(或被跳过/检查失败,手动模式下会弹 Toast 告知)。
 */
export async function checkForUpdate(manual: boolean): Promise<UpdateInfo | null> {
  const s = useAppStore.getState();
  if (!manual && s.settings["auto_update_enabled"] === "0") return null;

  let release: GithubRelease;
  try {
    const resp = await fetch(RELEASES_LATEST, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) throw new Error(String(resp.status));
    release = await resp.json();
  } catch {
    if (manual) s.pushToast(t("S.Update.CheckFailed"));
    return null;
  }

  const remote = parseSemver(release.tag_name ?? "");
  const current = parseSemver(await getVersion());
  if (!remote || !current || !newer(remote, current)) {
    if (manual) s.pushToast(t("S.Update.UpToDate"));
    return null;
  }

  const version = remote.join(".");
  if (!manual && s.settings["ignored_update_version"] === version) return null;

  const asset = pickExeAsset(release);
  if (!asset) {
    if (manual) s.pushToast(t("S.Update.NoAsset"));
    return null;
  }

  return {
    version,
    notes: release.body ?? "",
    assetUrl: asset.browser_download_url,
    assetName: asset.name,
    currentVersion: current.join("."),
  };
}

/**
 * 「重新安装当前版本」:资产名/下载地址由 release.ps1 的命名约定**完全确定**
 * (tag=`v{version}`、资产 `MinimalTodoApp-v{version}-win-x64.exe`),故**直接拼直链、
 * 不调 GitHub API**——既不消耗匿名接口 60 次/小时配额,也能在接口被限流(403)时照常重装。
 * 真实下载在 Rust 侧(避开资产 CDN 的 CORS);资产不存在则 Rust 下载报 HTTP 404,对话框内可见。
 */
export async function fetchReinstallInfo(): Promise<UpdateInfo | null> {
  const current = await getVersion();
  const tag = `v${current}`;
  const assetName = `MinimalTodoApp-${tag}-win-x64.exe`;
  const assetUrl =
    `https://github.com/${REPO_SLUG}/releases/download/${tag}/${assetName}`;

  return {
    version: current,
    notes: "",
    assetUrl,
    assetName,
    currentVersion: current,
    reinstall: true,
  };
}

/**
 * 下载资产并换壳重启:**下载在 Rust 侧完成**(GitHub 资产 CDN 无 CORS 头,前端 fetch 必失败),
 * 进度经 `update-progress` 事件回传。成功后应用自行退出重启;失败 invoke 抛错。
 */
export async function downloadAndApply(
  info: UpdateInfo,
  onProgress: (ratio: number) => void,
): Promise<void> {
  const unlisten = await listen<number>("update-progress", (e) =>
    onProgress(Math.min(1, Math.max(0, e.payload))),
  );
  try {
    // camelCase 键映射 Rust snake_case 形参(Tauri 默认转换);成功后 Rust 触发 bat 重启
    await invoke("download_update", { url: info.assetUrl, fileName: info.assetName });
    onProgress(1);
  } finally {
    unlisten();
  }
}
