// Claude Code のフックから呼ばれる。src 配下の画面コード（.ts/.tsx/.css）への編集のときだけ、
// AGENTS.md「地図UIの決まり」の機械チェックを行う。
//   1. ★ を出さない（期待度は ♪ で表す）
//   2. 11px 未満の文字サイズを使わない（夕暮れに屋外で読む画面だから）
//   3. Leaflet を持ち込まない（参照実装はLeafletだが、実装先はMapLibre GL）
// stdin に PostToolUse のJSONが流れてくる。対象外の編集なら何もしない。
// 終了コード2を返すとエラー内容がClaudeにフィードバックされる。
import { readFileSync } from "node:fs";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let filePath = "";
try {
  const data = JSON.parse(input);
  filePath = (data?.tool_input?.file_path ?? "").replaceAll("\\", "/");
} catch {
  process.exit(0);
}

if (!/\/src\/.+\.(ts|tsx|css)$/i.test(filePath)) process.exit(0);

let text;
try {
  text = readFileSync(filePath, "utf8");
} catch {
  process.exit(0);
}

const problems = [];
const lines = text.split("\n");

lines.forEach((line, i) => {
  const at = `${filePath.split("/src/").pop()}:${i + 1}`;

  if (line.includes("★")) {
    problems.push(`${at}: ★ を画面に出さない決まり。期待度は ♪（notesText）で表す（AGENTS.md「地図UIの決まり」）`);
  }

  // Tailwind の任意値: text-[10px] など
  for (const m of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    if (Number(m[1]) < 11) {
      problems.push(`${at}: 文字サイズ ${m[1]}px は 11px 未満。11px を下回らない決まり（AGENTS.md「地図UIの決まり」）`);
    }
  }

  // CSS / インラインスタイルの font-size / fontSize
  for (const m of line.matchAll(/(?:font-size\s*:|fontSize\s*[:=])\s*["']?(\d+(?:\.\d+)?)px/g)) {
    if (Number(m[1]) < 11) {
      problems.push(`${at}: 文字サイズ ${m[1]}px は 11px 未満。11px を下回らない決まり（AGENTS.md「地図UIの決まり」）`);
    }
  }

  if (/(?:from\s+["']leaflet|require\(\s*["']leaflet|import\s*\(\s*["']leaflet)/.test(line)) {
    problems.push(`${at}: Leaflet を持ち込まない決まり。実装先は MapLibre GL（AGENTS.md「地図UIの決まり」、対応表はハンドオフのREADME）`);
  }
});

if (problems.length === 0) process.exit(0);

console.error("画面コードの機械チェックで問題が見つかった。直してから続けること:");
for (const p of problems) console.error(`  - ${p}`);
process.exit(2);
