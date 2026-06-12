/** 字体设置应用为 CSS 变量(body 在 index.css 中引用) */
export function applyFontSettings(family: string, size: number, lineSpacing: number) {
  const el = document.documentElement;
  el.style.setProperty("--app-font", `"${family.split(",")[0].trim()}", "Segoe UI", system-ui, sans-serif`);
  el.style.setProperty("--app-font-size", `${size}px`);
  el.style.setProperty("--app-line-height", String(lineSpacing * 1.4));
}
