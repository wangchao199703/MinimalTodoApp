import { db } from "./db";

/**
 * 便签/分组图标在 Web 版存为 IndexedDB Blob,展示时需要一个 URL。
 * tiptap 的 renderHTML / `<img src>` 解析是**同步**的,所以维护一个 name→objectURL 同步缓存:
 * 启动时预热全部、插入新图时即时写入,渲染时同步取。
 */
const urlCache = new Map<string, string>();

/** 同步取图片 URL;未命中返回空串(调用方按需兜底)。 */
export function imageUrl(name: string): string {
  return urlCache.get(name) ?? "";
}

/** 为一张 Blob 建立(或复用)objectURL 并缓存,返回 URL。 */
export function cacheImage(name: string, blob: Blob): string {
  let url = urlCache.get(name);
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(name, url);
  }
  return url;
}

/** 启动时把库里所有图片一次性建好 objectURL,保证同步渲染可命中。 */
export async function preloadImages(): Promise<void> {
  const all = await db.images.toArray();
  for (const img of all) {
    if (!urlCache.has(img.name)) urlCache.set(img.name, URL.createObjectURL(img.blob));
  }
}

/** 卸载前回收所有 objectURL,避免会话内泄漏。 */
export function revokeAllImageUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
