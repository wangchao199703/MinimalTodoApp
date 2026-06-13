/** 字体设置应用为根级样式 + CSS 变量(body/便签在 index.css 中引用) */
export function applyFontSettings(family: string, size: number, lineSpacing: number) {
  const el = document.documentElement;
  el.style.setProperty("--app-font", `"${family.split(",")[0].trim()}", "Segoe UI", system-ui, sans-serif`);
  // 全局字号:直接缩放根 rem——Tailwind 文字尺寸皆为 rem,故整 UI 等比缩放(单设 body 会被 text-* 覆盖)。
  // 14 为中性基准(=16px 浏览器默认根),保证默认观感不变。
  el.style.fontSize = `${((size || 14) / 14) * 16}px`;
  // 全局行距:供内容继承(便签未设独立行距时回退到它)
  el.style.setProperty("--app-line-height", String((lineSpacing || 1.1) * 1.4));
}
