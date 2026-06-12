// 一次性转换脚本:旧版 WPF 资产 → 新版 JSON
//   - legacy/.../Lang/Strings.{zh,en}.xaml → src/i18n/{zh,en}.json
//   (主题已改为 todo-flow 六主题方案,不再从 legacy 转换)
// 用法:node scripts/convert-legacy-assets.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const legacy = join(root, "legacy", "MinimalTodoApp");

// —— i18n 字符串 ——
mkdirSync(join(root, "src", "i18n"), { recursive: true });
const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

for (const [lang, file] of [["zh", "Strings.zh.xaml"], ["en", "Strings.en.xaml"]]) {
  const text = readFileSync(join(legacy, "Lang", file), "utf8");
  const dict = {};
  for (const m of text.matchAll(
    /<sys:String x:Key="([^"]+)"(?:\s+xml:space="preserve")?\s*>([\s\S]*?)<\/sys:String>/g,
  )) {
    dict[m[1]] = unescapeXml(m[2]);
  }
  const count = Object.keys(dict).length;
  if (count < 400) throw new Error(`${lang}: only ${count} keys parsed`);
  writeFileSync(join(root, "src", "i18n", `${lang}.json`), JSON.stringify(dict, null, 1));
  console.log(`${lang}: ${count} keys`);
}

console.log(
  `xaml themes: ${Object.keys(xaml).length}, palettes: ${palettes.length}(+3 frosted in TS)`,
);
