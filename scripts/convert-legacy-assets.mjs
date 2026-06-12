// 一次性转换脚本:旧版 WPF 资产 → 新版 JSON
//   - legacy/MinimalTodoApp/Themes/*.xaml      → src/lib/themes-builtin.json(xaml 主题成品色)
//   - legacy/.../Infrastructure/BuiltinThemes.cs → 同文件(palettes 锚点,运行时派生)
//   - legacy/.../Lang/Strings.{zh,en}.xaml      → src/i18n/{zh,en}.json
// 用法:node scripts/convert-legacy-assets.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const legacy = join(root, "legacy", "MinimalTodoApp");

// —— xaml 主题元数据(Key → 分组,与旧 ThemeManager.Builtin 一致,顺序即展示顺序)——
const XAML_THEMES = [
  ["Light", "Classic"], ["Dark", "Classic"], ["Nord", "Classic"], ["Ocean", "Classic"],
  ["Forest", "Classic"], ["Rose", "Classic"], ["Oat", "Classic"], ["Haze", "Classic"],
  ["Sage", "Classic"], ["Graphite", "Classic"], ["Clay", "Classic"], ["Fog", "Classic"],
  ["Slate", "Classic"],
  ["Morandi1", "Morandi"], ["Morandi2", "Morandi"], ["Morandi3", "Morandi"],
  ["Macaron1", "Macaron"], ["Macaron2", "Macaron"], ["Macaron3", "Macaron"],
  ["Dunhuang1", "Dunhuang"], ["Dunhuang2", "Dunhuang"], ["Dunhuang3", "Dunhuang"],
  ["Mondrian1", "Mondrian"], ["Mondrian2", "Mondrian"], ["Mondrian3", "Mondrian"],
  ["Transparent", "Transparent"], ["Glass", "Transparent"],
];

const xaml = {};
for (const [key, group] of XAML_THEMES) {
  const text = readFileSync(join(legacy, "Themes", `${key}.xaml`), "utf8");
  const colors = {};
  for (const m of text.matchAll(/x:Key="(\w+)"\s+Color="(#[0-9A-Fa-f]{6,8})"/g)) {
    colors[m[1]] = m[2];
  }
  if (!colors.WindowBg) throw new Error(`theme ${key}: WindowBg missing`);
  xaml[key] = { group, colors };
}

// —— 代码调色板锚点:解析 BuiltinThemes.cs 的 L(...)/D(...) 行 ——
const cs = readFileSync(join(legacy, "Infrastructure", "BuiltinThemes.cs"), "utf8");
const palettes = [];
for (const m of cs.matchAll(
  /list\.Add\((L|D)\("(\w+)",\s*"[\w.]+",\s*(\w+),\s*"(#[0-9A-Fa-f]{6})",\s*"(#[0-9A-Fa-f]{6})",\s*"(#[0-9A-Fa-f]{6})",\s*"(#[0-9A-Fa-f]{6})"\)\)/g,
)) {
  palettes.push({
    key: m[2],
    dark: m[1] === "D",
    group: m[3],
    bg: m[4],
    card: m[5],
    text: m[6],
    accent: m[7],
  });
}
if (palettes.length < 70) throw new Error(`palettes parsed: ${palettes.length}, expected 70+`);

mkdirSync(join(root, "src", "lib"), { recursive: true });
writeFileSync(
  join(root, "src", "lib", "themes-builtin.json"),
  JSON.stringify({ xaml, palettes }, null, 1),
);

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
