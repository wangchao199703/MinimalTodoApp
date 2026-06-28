// 更新检查与下载(前端侧):GitHub releases/latest 轮询 + SemVer 三段比对,
// 下载便携 exe 后把字节交给 Rust 的 apply_update 完成换壳重启。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { useAppStore } from "../store/useAppStore";
import { isTauri } from "./env";

const REPO_SLUG = "wangchao199703/desk-helper";
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
 * 检查更新(对齐 WPF UpdateService.CheckAsync 的三态契约,**调用方据此给反馈**):
 * - 返回 `UpdateInfo`:有比当前更新的可下载版本;
 * - 返回 `null`:**确实已是最新**(或最新版无资产 / 被「忽略此版本」跳过);
 * - **抛异常**:检查未成功(网络错误、HTTP 非 2xx 如匿名接口 403 限流)——不可误报成「已是最新」。
 * manual=true 时无视 auto_update_enabled 与 ignored_update_version(手动检查必查、必显示结果)。
 */
export async function checkForUpdate(manual: boolean): Promise<UpdateInfo | null> {
  if (!isTauri) return null; // Web/PWA 自更新走 Service Worker,不走桌面的 GitHub exe 替换
  const s = useAppStore.getState();
  if (!manual && s.settings["auto_update_enabled"] === "0") return null;

  const resp = await fetch(RELEASES_LATEST, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`); // 非 2xx=检查失败,抛给调用方
  const release: GithubRelease = await resp.json();

  const remote = parseSemver(release.tag_name ?? "");
  const current = parseSemver(await getVersion());
  if (!remote || !current || !newer(remote, current)) return null; // 已是最新

  const version = remote.join(".");
  if (!manual && s.settings["ignored_update_version"] === version) return null;

  const asset = pickExeAsset(release);
  if (!asset) return null; // 最新版暂无可下载资产 → 视为无可用更新

  return {
    version,
    notes: release.body ?? "",
    assetUrl: asset.browser_download_url,
    assetName: asset.name,
    currentVersion: current.join("."),
  };
}

/**
 * 「重新安装当前版本」:资产名/下载地址由 release 脚本的命名约定**完全确定**
 * (tag=`v{version}`、资产 `DeskHelper-v{version}-win-x64.exe`),故**直接拼直链、
 * 不调 GitHub API**——既不消耗匿名接口 60 次/小时配额,也能在接口被限流(403)时照常重装。
 * 真实下载在 Rust 侧(避开资产 CDN 的 CORS);资产不存在则 Rust 下载报 HTTP 404,对话框内可见。
 */
/** 某版本便携 exe 的 GitHub 资产直链(release 脚本命名约定):重装走当前版本直链。 */
export function releaseAssetUrl(version: string): { url: string; name: string } {
  const name = `DeskHelper-v${version}-win-x64.exe`;
  return { url: `https://github.com/${REPO_SLUG}/releases/download/v${version}/${name}`, name };
}

/**
 * 最新发布页(设置内独立「手动下载」用):GitHub `/releases/latest` 自动重定向到最新 release,
 * 用户在页面下载**最新版**资产。资产名带版本号、无稳定的「latest 直链」,故打开发布页而非直下文件。
 */
export const LATEST_RELEASE_PAGE = `https://github.com/${REPO_SLUG}/releases/latest`;

export async function fetchReinstallInfo(): Promise<UpdateInfo | null> {
  const current = await getVersion();
  const { url, name } = releaseAssetUrl(current);
  return {
    version: current,
    notes: "",
    assetUrl: url,
    assetName: name,
    currentVersion: current,
    reinstall: true,
  };
}

/** 「手动下载」:用系统默认浏览器打开下载地址,交浏览器自行下载(应用内自动更新失败时的兜底)。 */
export async function openDownloadUrl(url: string): Promise<void> {
  await invoke("open_url", { url });
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
