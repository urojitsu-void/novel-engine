#!/usr/bin/env node
/**
 * VN YAML Validator (TypeScript)
 * - YAML を読み込み、src/script/parser.ts のバリデーションで検証だけを行う
 * - fetch なし。ファイル/ディレクトリを引数で受け取る
 *
 * 使い方例:
 *   pnpm run validate:story -- stories/demo/story.vn.yaml
 *   pnpm run validate:story -- stories/            # ディレクトリ再帰
 *   pnpm run validate:story -- stories/a.yml stories/b.yaml
 */

import fs from "node:fs";
import path from "node:path";
import { parseScriptYAML } from "./parser"; // 既存の検証ロジックを利用
import * as yaml from "js-yaml";

/* ========== CLI 引数 ========= */
type CliArgs = { _: string[]; quiet?: boolean };
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--quiet" || a === "-q") args.quiet = true;
    else if (!a.startsWith("--")) args._.push(a);
  }
  return args;
}

/* ========== ユーティリティ ========= */
function isYamlFile(p: string): boolean {
  return /\.(ya?ml)$/i.test(p);
}

function collectYamlFiles(inputPath: string): string[] {
  const st = fs.statSync(inputPath);
  if (st.isFile()) {
    return isYamlFile(inputPath) ? [inputPath] : [];
  }
  if (st.isDirectory()) {
    const out: string[] = [];
    for (const name of fs.readdirSync(inputPath)) {
      const child = path.join(inputPath, name);
      const cst = fs.statSync(child);
      if (cst.isDirectory()) {
        out.push(...collectYamlFiles(child));
      } else if (cst.isFile() && isYamlFile(child)) {
        out.push(child);
      }
    }
    return out;
  }
  return [];
}

/** js-yaml の構文エラーに行/列情報があれば整形して返す */
function formatYamlError(e: unknown): string {
  const err = e as any;
  // js-yaml の YAMLException は mark を持つことが多い
  const where =
    err?.mark && typeof err.mark.line === "number"
      ? ` (line ${err.mark.line + 1}, col ${err.mark.column + 1})`
      : "";
  const msg = (err?.message ?? String(e)).replace(/\n+?at[\s\S]*$/m, "");
  return `${msg}${where}`;
}

/* ========== メイン ========= */
(async function main() {
  const args = parseArgs(process.argv);
  if (args._.length === 0) {
    console.error(
      "Usage: tsx scripts/validate.ts <file-or-dir> [more files...] [--quiet]"
    );
    process.exit(1);
  }

  // 収集
  const inputs = args._.flatMap((p) => {
    const full = path.resolve(process.cwd(), p);
    if (!fs.existsSync(full)) {
      console.error(`⚠️  Not found: ${p}`);
      return [];
    }
    return collectYamlFiles(full);
  });

  if (inputs.length === 0) {
    console.error("No YAML files to validate.");
    process.exit(1);
  }

  let okCount = 0;
  let ngCount = 0;

  for (const file of inputs) {
    const rel = path.relative(process.cwd(), file) || file;
    try {
      const text = fs.readFileSync(file, "utf8");

      // baseDir は Node のパスから算出（ブラウザの location に依存しない）
      const baseDir = path
        .dirname(file)
        .split(path.sep)
        .join("/") + "/";

      // YAML 構文エラー検出のため、一旦 js-yaml で構文だけ試す（行番号を得やすい）
      try {
        yaml.load(text);
      } catch (e) {
        throw new Error(formatYamlError(e));
      }

      // スキーマ検証（例外で失敗を表す）
      parseScriptYAML(text, { baseDir });

      if (!args.quiet) console.log(`✅ OK: ${rel}`);
      okCount++;
    } catch (e) {
      console.error(`❌ NG: ${rel}\n   ${e instanceof Error ? e.message : String(e)}`);
      ngCount++;
    }
  }

  if (!args.quiet) {
    console.log(
      `\nSummary: ${okCount} OK, ${ngCount} NG (total ${okCount + ngCount})`
    );
  }
  process.exit(ngCount > 0 ? 1 : 0);
})();
