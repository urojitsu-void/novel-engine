// scripts/validate.ts
/**
 * VN YAML Validator (TypeScript)
 * - YAML 構文/スキーマ検証 + 同一フォルダ内ファイル存在チェック
 *
 * 使い方:
 *   pnpm run validate:story -- stories/demo/story.vn.yaml
 *   pnpm run validate:story -- stories/            # ディレクトリ再帰
 *   pnpm run validate:story -- stories/a.yml stories/b.yaml -q
 */

import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { validateScriptObject, isLineObject } from "./parser";
import type { Script, LineObject } from "../types";

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
  if (st.isFile()) return isYamlFile(inputPath) ? [inputPath] : [];
  if (st.isDirectory()) {
    const out: string[] = [];
    for (const name of fs.readdirSync(inputPath)) {
      const child = path.join(inputPath, name);
      const cst = fs.statSync(child);
      if (cst.isDirectory()) out.push(...collectYamlFiles(child));
      else if (cst.isFile() && isYamlFile(child)) out.push(child);
    }
    return out;
  }
  return [];
}

/** js-yaml 構文エラーを行/列つきで整形 */
function formatYamlError(e: unknown): string {
  const err = e as any;
  const where =
    err?.mark && typeof err.mark.line === "number"
      ? ` (line ${err.mark.line + 1}, col ${err.mark.column + 1})`
      : "";
  const msg = (err?.message ?? String(e)).replace(/\n+?at[\s\S]*$/m, "");
  return `${msg}${where}`;
}

/* ========== 同一フォルダ・存在チェック ========= */

/** パスが「同一フォルダ直下のファイル」かを判定し、ファイル名を返す */
function normalizeSameDirPath(raw: string): { ok: boolean; name?: string; reason?: string } {
  let p = raw.trim();
  if (!p) return { ok: false, reason: "empty path" };
  // 絶対/URLは不可
  if (p.startsWith("http://") || p.startsWith("https://")) {
    return { ok: false, reason: "URL is not allowed" };
  }
  if (p.startsWith("/")) {
    return { ok: false, reason: "absolute path is not allowed" };
  }
  if (p.startsWith("./")) p = p.slice(2);
  // サブディレクトリ禁止
  if (p.includes("/") || p.includes("\\")) {
    return { ok: false, reason: "must be in the same folder (no subdirectories)" };
  }
  return { ok: true, name: p };
}

/** Script から参照アセットを収集してエラーメッセージを返す */
function checkAssetsSameFolder(script: Script, yamlAbsPath: string): string[] {
  const errors: string[] = [];
  const folder = path.dirname(yamlAbsPath);

  // characters.*.chara
  if (script.characters) {
    for (const [charId, c] of Object.entries(script.characters)) {
      if (!c.chara) continue;
      const norm = normalizeSameDirPath(c.chara);
      if (!norm.ok) {
        errors.push(`characters.${charId}.chara: ${norm.reason} ("${c.chara}")`);
      } else {
        const full = path.join(folder, norm.name!);
        if (!fs.existsSync(full)) {
          errors.push(`characters.${charId}.chara: file not found next to YAML ("${norm.name}")`);
        }
      }
    }
  }

  // story blocks
  for (const block of script.story) {
    const lines = block.lines;
    lines.forEach((ln, idx) => {
      if (!isLineObject(ln)) return;
      const pfx = `story["${block.name}"].lines[${idx}]`;

      // bg
      if (typeof ln.bg === "string") {
        const norm = normalizeSameDirPath(ln.bg);
        if (!norm.ok) errors.push(`${pfx}.bg: ${norm.reason} ("${ln.bg}")`);
        else if (!fs.existsSync(path.join(folder, norm.name!))) {
          errors.push(`${pfx}.bg: file not found ("${norm.name}")`);
        }
      }

      // bgm
      if (typeof ln.bgm === "string" && ln.bgm !== "stop") {
        const norm = normalizeSameDirPath(ln.bgm);
        if (!norm.ok) errors.push(`${pfx}.bgm: ${norm.reason} ("${ln.bgm}")`);
        else if (!fs.existsSync(path.join(folder, norm.name!))) {
          errors.push(`${pfx}.bgm: file not found ("${norm.name}")`);
        }
      }

      // sfx
      if (typeof ln.sfx === "string") {
        const norm = normalizeSameDirPath(ln.sfx);
        if (!norm.ok) errors.push(`${pfx}.sfx: ${norm.reason} ("${ln.sfx}")`);
        else if (!fs.existsSync(path.join(folder, norm.name!))) {
          errors.push(`${pfx}.sfx: file not found ("${norm.name}")`);
        }
      }

      // line-level chara
      if (typeof ln.chara === "string") {
        const norm = normalizeSameDirPath(ln.chara);
        if (!norm.ok) errors.push(`${pfx}.chara: ${norm.reason} ("${ln.chara}")`);
        else if (!fs.existsSync(path.join(folder, norm.name!))) {
          errors.push(`${pfx}.chara: file not found ("${norm.name}")`);
        }
      }

      // actors.*.chara
      if (ln.actors && typeof ln.actors === "object") {
        for (const [who, spec] of Object.entries(ln.actors as Record<string, { chara?: string }>)) {
          const chara = spec?.chara;
          if (!chara) continue;
          const norm = normalizeSameDirPath(chara);
          if (!norm.ok) errors.push(`${pfx}.actors.${who}.chara: ${norm.reason} ("${chara}")`);
          else if (!fs.existsSync(path.join(folder, norm.name!))) {
            errors.push(`${pfx}.actors.${who}.chara: file not found ("${norm.name}")`);
          }
        }
      }
    });
  }

  return errors;
}

/* ========== メイン ========= */
(async function main() {
  const args = parseArgs(process.argv);
  if (args._.length === 0) {
    console.error("Usage: tsx scripts/validate.ts <file-or-dir> [more files...] [--quiet|-q]");
    process.exit(1);
  }

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

  let okCount = 0, ngCount = 0;

  for (const file of inputs) {
    const rel = path.relative(process.cwd(), file) || file;
    try {
      const text = fs.readFileSync(file, "utf8");

      // 構文チェック（行番号を取りやすい）
      let root: unknown;
      try {
        root = yaml.load(text);
      } catch (e) {
        throw new Error(formatYamlError(e));
      }

      // スキーマ検証（baseDir は Node 側から）
      const baseDir = path.dirname(file).split(path.sep).join("/") + "/";
      const script: Script = validateScriptObject(root, { baseDir });

      // 参照ファイル（同一フォルダ・存在）チェック
      const assetErrors = checkAssetsSameFolder(script, file);
      if (assetErrors.length) {
        throw new Error(
          "Asset validation failed:\n - " + assetErrors.join("\n - ")
        );
      }

      if (!args.quiet) console.log(`✅ OK: ${rel}`);
      okCount++;
    } catch (e) {
      console.error(`❌ NG: ${rel}\n   ${e instanceof Error ? e.message : String(e)}`);
      ngCount++;
    }
  }

  if (!args.quiet) {
    console.log(`\nSummary: ${okCount} OK, ${ngCount} NG (total ${okCount + ngCount})`);
  }
  process.exit(ngCount > 0 ? 1 : 0);
})();
