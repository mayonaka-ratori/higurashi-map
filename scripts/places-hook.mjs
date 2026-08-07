// Claude Code のフックから呼ばれる。places.json への編集のときだけ検査を実行する。
// stdin に PostToolUse のJSONが流れてくる。places.json 以外の編集なら何もしない。
// 終了コード2を返すとエラー内容がClaudeにフィードバックされる。
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let filePath = "";
try {
  const data = JSON.parse(input);
  filePath = data?.tool_input?.file_path ?? "";
} catch {
  process.exit(0);
}

if (!/places\.json$/i.test(filePath.replaceAll("\\", "/"))) process.exit(0);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
try {
  const out = execFileSync(process.execPath, [join(root, "scripts", "validate-places.mjs")], {
    encoding: "utf8",
  });
  console.log(out.trim());
  process.exit(0);
} catch (e) {
  // 検査が失敗（エラーあり）→ 終了コード2でClaudeに内容を返す
  console.error((e.stdout ?? "") + (e.stderr ?? ""));
  process.exit(2);
}
