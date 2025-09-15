#!/usr/bin/env node
/**
 * YAML → Mermaid(flowchart) 変換 CLI（TypeScript, Markdown出力版）
 * 使い方例:
 *   pnpm run export:mermaid -- stories/demo/story.vn.yaml
 *   pnpm run export:mermaid -- stories/demo/story.vn.yaml --mode block --out flow.md
 *
 * 既定動作:
 *   - 出力拡張子は .md
 *   - 中身は ```mermaid フェンスで囲みます
 *
 * 任意オプション:
 *   --out <path>             出力先（省略時: 入力と同ディレクトリに .md）
 *   --mode <block|detailed>  出力の詳細度（既定: detailed）
 *   --conditions             choice の require/requireNot をエッジラベルに表示
 *   --truncate <n>           ノード表示文字数を n に丸める（既定: 28, 最小8）
 *   --raw                    フェンス無しで生の Mermaid を出力（拡張子は指定推奨 .mmd）
 */

import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

/* ========= types ========= */
type Pos = "left" | "center" | "right";

interface Character {
  name: string;
  color?: string;
  chara?: string;
  pos?: Pos;
}

export interface ChoiceItem {
  text?: string;
  goto?: string;
  set?: Record<string, boolean | number | string>;
  require?: string | string[];
  requireNot?: string | string[];
}

export interface ActorDirective {
  show?: boolean;
  pos?: Pos;
  chara?: string;
}

export interface LineObject {
  bg?: string;
  bgm?: string | "stop";
  sfx?: string;
  wait?: string;
  label?: string;
  goto?: string;
  choice?: ChoiceItem[];
  actors?: Record<string, ActorDirective>;
  narrator?: string;
  [speakerOrKey: string]:
  | string
  | number
  | boolean
  | undefined
  | ChoiceItem[]
  | Record<string, ActorDirective>;
}
export type Line = string | LineObject;

export interface StoryBlock {
  name: string;
  lines: Line[];
}

export interface Script {
  id: string;
  title?: string;
  characters?: Record<string, Character>;
  story: StoryBlock[];
}

/* ========= args ========= */
type Mode = "block" | "detailed";
interface CliArgs {
  _: string[];
  out?: string;
  mode?: Mode;
  conditions?: boolean;
  truncate?: number;
  raw?: boolean; // ← 追加: フェンス無し
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--mode") args.mode = (argv[++i] as Mode) || "detailed";
    else if (a === "--conditions") args.conditions = true;
    else if (a === "--truncate") args.truncate = Number(argv[++i] ?? "0");
    else if (a === "--raw") args.raw = true;
    else if (!a.startsWith("--")) args._.push(a);
  }
  return args;
}

/* ========= load YAML ========= */
function loadScriptFromFile(filePath: string): Script {
  const text = fs.readFileSync(filePath, "utf8");
  const root = yaml.load(text) as any;

  if (!root || typeof root !== "object")
    throw new Error("YAML root must be an object.");
  if (!Array.isArray(root.story))
    throw new Error("YAML: top-level 'story' must be an array.");
  if (
    !root.story.every(
      (b: any) => b && typeof b.name === "string" && Array.isArray(b.lines)
    )
  ) {
    throw new Error(
      "YAML: each story block needs { name: string, lines: array }."
    );
  }

  const script: Script = {
    id: String(root.id ?? "story"),
    title: root.title,
    characters: root.characters ?? {},
    story: root.story.map((b: any) => ({
      name: String(b.name),
      lines: b.lines as Line[],
    })),
  };
  return script;
}

/* ========= mermaid ========= */
interface MermaidOpts {
  mode: Mode;
  truncate: number;
  showChoiceConditions: boolean;
}

function scriptToMermaid(script: Script, opts: MermaidOpts): string {
  const mode = opts.mode ?? "block";
  const truncateN = Math.max(8, opts.truncate ?? 28);
  const showConds = !!opts.showChoiceConditions;

  const out: string[] = [];
  out.push("flowchart TD");

  if (mode === "block") {
    const edges: Array<{ from: string; to: string; label?: string }> = [];
    const blockSet = new Set(script.story.map((b) => b.name));

    for (const block of script.story) {
      const from = sanitizeId(block.name);
      out.push(`  ${from}([${escapeText(block.name)}])`);

      for (const ln of block.lines) {
        if (!isLineObject(ln)) continue;

        if (typeof ln.goto === "string" && ln.goto.trim()) {
          const target = resolveTargetBlock(ln.goto.trim(), blockSet, block.name);
          if (target)
            edges.push({
              from,
              to: sanitizeId(target),
              label: gotoLabel(ln.goto),
            });
        }

        if (Array.isArray(ln.choice)) {
          for (const ch of ln.choice) {
            if (!ch?.goto) continue;
            const target = resolveTargetBlock(ch.goto, blockSet, block.name);
            if (target) {
              const lab = showConds ? choiceEdgeLabel(ch) : ch.text || "choice";
              edges.push({ from, to: sanitizeId(target), label: lab });
            }
          }
        }
      }
    }

    const seen = new Set<string>();
    for (const e of edges) {
      const key = `${e.from}->${e.to}|${e.label ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(
        e.label
          ? `  ${e.from} -- "${escapeText(e.label)}" --> ${e.to}`
          : `  ${e.from} --> ${e.to}`
      );
    }
    return out.join("\n");
  }

  // ===== detailed: サブグラフ＋行単位の可視化 =====
  for (const block of script.story) {
    const bId = sanitizeId(block.name);
    out.push(`  subgraph ${bId}[${escapeText(block.name)}]`);
    const startId = nodeId(bId, "start"); // サブグラフのエントリ
    out.push(`    ${startId}([start])`);
    let prevNode: string | null = startId;
    const labelNodeId = new Map<string, string>();

    block.lines.forEach((ln, idx) => {
      const base = `${bId}_${idx}`;
      if (isLineObject(ln)) {
        // label
        if (typeof ln.label === "string" && ln.label.trim()) {
          const lab = ln.label.trim();
          const labId = nodeId(base, "label_" + sanitizeId(lab));
          labelNodeId.set(lab, labId);
          out.push(`    ${labId}([::${escapeText(lab)}])`);
          if (prevNode) out.push(`    ${prevNode} --> ${labId}`);
          prevNode = labId;
        }

        // choice
        if (Array.isArray(ln.choice) && ln.choice.length > 0) {
          const choiceId = nodeId(base, "choice");
          out.push(`    ${choiceId}{${escapeText("choice")}}`);
          if (prevNode) out.push(`    ${prevNode} --> ${choiceId}`);
          prevNode = null;

          ln.choice.forEach((ch, i) => {
            const edgeLabel = showConds
              ? choiceEdgeLabel(ch)
              : ch.text || `choice ${i + 1}`;
            const targetNode = resolveDetailedTargetId(
              ch.goto,
              block.name,
              script,
              labelNodeId
            );
            if (targetNode) {
              out.push(`    ${choiceId} -- "${escapeText(edgeLabel)}" --> ${targetNode}`);
            } else {
              out.push(`    ${choiceId} -- "${escapeText(edgeLabel)}" --> ${choiceId}`);
            }
          });
        }

        // goto
        if (typeof ln.goto === "string" && ln.goto.trim()) {
          const gotoId = nodeId(base, "goto");
          out.push(`    ${gotoId}[${escapeText(gotoLabel(ln.goto))}]`);
          if (prevNode) out.push(`    ${prevNode} --> ${gotoId}`);
          prevNode = gotoId;

          const targetNode = resolveDetailedTargetId(
            ln.goto.trim(),
            block.name,
            script,
            labelNodeId
          );
          if (targetNode) out.push(`    ${gotoId} --> ${targetNode}`);
          prevNode = null;
        }

        // 表示テキスト
        const speeches = extractSpeeches(ln);
        if (speeches.length > 0) {
          const txt = truncate(speeches.join(" / "), truncateN);
          const spId = nodeId(base, "say");
          out.push(`    ${spId}[${escapeText(txt)}]`);
          if (prevNode) out.push(`    ${prevNode} --> ${spId}`);
          prevNode = spId;
        }
      } else {
        const txt = truncate(String(ln), truncateN);
        const spId = nodeId(bId, `say_${idx}`);
        out.push(`    ${spId}[${escapeText(txt)}]`);
        if (prevNode) out.push(`    ${prevNode} --> ${spId}`);
        prevNode = spId;
      }
    });

    out.push("  end");
  }

  // subgraph と同名のトップレベルノードは出力しない（ID重複回避）
  return out.join("\n");
}

/* ========= helpers ========= */
function isLineObject(x: Line): x is LineObject {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function sanitizeId(s: string): string {
  return s.replace(/[^\w]/g, "_");
}
function nodeId(base: string, suffix: string): string {
  return `${base}_${suffix}`;
}
function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}
function escapeText(s: string): string {
  return s.replace(/"/g, '\\"').replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const CONTROL_KEYS = new Set([
  "bg",
  "bgm",
  "sfx",
  "wait",
  "label",
  "goto",
  "choice",
  "actors",
  "chara",
  "narrator",
]);
function extractSpeeches(ln: LineObject): string[] {
  const out: string[] = [];
  if (typeof ln.narrator === "string") out.push(ln.narrator);
  for (const [k, v] of Object.entries(ln)) {
    if (typeof v !== "string") continue;
    if (CONTROL_KEYS.has(k)) continue;
    out.push(v);
  }
  return out;
}
function choiceEdgeLabel(ch: ChoiceItem): string {
  const conds: string[] = [];
  if (ch.require) {
    const r = Array.isArray(ch.require) ? ch.require : [ch.require];
    if (r.length) conds.push(`req:${r.join("&")}`);
  }
  if (ch.requireNot) {
    const r = Array.isArray(ch.requireNot) ? ch.requireNot : [ch.requireNot];
    if (r.length) conds.push(`not:${r.join("&")}`);
  }
  return conds.length
    ? `${ch.text ?? "choice"} [${conds.join(", ")}]`
    : ch.text ?? "choice";
}
function gotoLabel(g: string): string {
  return `goto: ${g}`;
}

/** blockモード用: 遷移先が block or label かを見てブロック名を返す */
function resolveTargetBlock(
  goto: string,
  blockSet: Set<string>,
  currentBlock: string
): string | null {
  const s = goto.trim();
  const p = s.indexOf("#");
  if (p >= 0) {
    const block = s.slice(0, p).trim();
    const label = s.slice(p + 1).trim();
    if (block && blockSet.has(block)) return block;
    if (!block && label) return currentBlock;
    return null;
  }
  if (!blockSet.has(s)) return currentBlock; // ラベル名のみなら同一ブロック
  return s; // ブロック名
}

/** detailed用: つなぐべき“ノードID”を常に返す（subgraph名ではなく start/label ノード） */
function resolveDetailedTargetId(
  goto: string | undefined,
  currentBlock: string,
  script: Script,
  labelMap: Map<string, string>
): string | null {
  if (!goto) return null;
  const s = goto.trim();
  const p = s.indexOf("#");
  if (p >= 0) {
    const block = s.slice(0, p).trim();
    const label = s.slice(p + 1).trim();
    if (block) {
      // 他ブロック → そのブロックの start ノードへ
      const bId = sanitizeId(block);
      return nodeId(bId, "start");
    } else {
      // 同一ブロック内のラベル
      const id = labelMap.get(label);
      return id ?? nodeId(sanitizeId(currentBlock), "start");
    }
  }
  // ブロック名 or 同一ブロック内ラベル
  const targetBlock = script.story.find((b) => b.name === s);
  if (targetBlock) {
    return nodeId(sanitizeId(targetBlock.name), "start");
  }
  // ラベル
  const id = labelMap.get(s);
  return id ?? nodeId(sanitizeId(currentBlock), "start");
}

/* ========= main ========= */
(function main() {
  const args = parseArgs(process.argv);
  if (args._.length === 0) {
    console.error(
      "Usage: tsx scripts/yaml2mermaid.ts <input.yaml> [--out flow.md] [--mode block|detailed] [--conditions] [--truncate 28] [--raw]"
    );
    process.exit(1);
  }

  const inPath = path.resolve(process.cwd(), args._[0]);
  const mode: Mode =
    args.mode === "block" || args.mode === "detailed" ? args.mode : "detailed";
  const truncateN = Math.max(
    8,
    Number.isFinite(args.truncate as number) && (args.truncate as number) > 0
      ? (args.truncate as number)
      : 28
  );

  // 既定は .md にしてフェンス付き
  const defaultOut = path.join(
    path.dirname(inPath),
    path.basename(inPath).replace(/\.(ya?ml)$/i, "") + ".md"
  );
  const outPath = args.out
    ? path.resolve(process.cwd(), args.out)
    : defaultOut;

  try {
    const script = loadScriptFromFile(inPath);
    const mermaid = scriptToMermaid(script, {
      mode,
      truncate: truncateN,
      showChoiceConditions: !!args.conditions,
    });

    const outText = args.raw ? mermaid : `\`\`\`mermaid\n${mermaid}\n\`\`\``;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, outText, "utf8");
    console.log(`✅ Mermaid exported: ${path.relative(process.cwd(), outPath)}`);
  } catch (e: any) {
    console.error("❌ Export failed:", e?.message || e);
    process.exit(1);
  }
})();
