// 更新检查与下载(前端侧):GitHub releases/latest 轮询 + SemVer 三段比对,
// 下载便携 exe 后把字节交给 Rust 的 apply_update 完成换壳重启。
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useAppStore } from "../store/useAppStore";
import { t } from "./i18n";

const RELEASES_LATEST =
  "https://api.github.com/repos/wangchao199703/MinimalTodoApp/releases/latest";

export interface UpdateInfo {
  version: string;
  notes: string;
  assetUrl: string;
  assetName: string;
  currentVersion: string;
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

  let release: {
    tag_name?: string;
    body?: string;
    assets?: { name: string; browser_download_url: string }[];
  };
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

  const asset = (release.assets ?? []).find((a) => a.name.toLowerCase().endsWith(".exe"));
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

/** 流式下载资产并上报进度(0~1),完成后交给 Rust 换壳重启(成功则进程退出) */
export async function downloadAndApply(
  info: UpdateInfo,
  onProgress: (ratio: number) => void,
): Promise<void> {
  const resp = await fetch(info.assetUrl);
  if (!resp.ok || !resp.body) throw new Error(`download failed: ${resp.status}`);
  const total = Number(resp.headers.get("content-length") ?? "0");
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress(Math.min(1, received / total));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  onProgress(1);
  // 原始字节走 IPC,文件名放 header(apply_update 成功后应用将自行退出重启)
  await invoke("apply_update", bytes, { headers: { "x-file-name": info.assetName } });
}
