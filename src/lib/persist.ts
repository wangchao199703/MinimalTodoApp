/**
 * 持久化存储:Web 版数据全在 IndexedDB,默认是「尽力而为」存储,磁盘紧张时可能被浏览器驱逐。
 * 申请 persistent 后浏览器不会自动清。无 StorageManager 的旧内核(部分鸿蒙 PC 浏览器)优雅降级。
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** 当前存储用量/配额(诊断/容量提示用);无 API 返回 null。 */
export function storageEstimate(): Promise<StorageEstimate | null> {
  return navigator.storage?.estimate?.() ?? Promise.resolve(null);
}
