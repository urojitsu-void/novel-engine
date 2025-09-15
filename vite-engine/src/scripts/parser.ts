// src/script/parser.ts
import yaml from "js-yaml";
import type {
  Script,
  StoryBlock,
  Line,
  LineObject,
  ChoiceItem,
  Character,
  CharaPos,
} from "../types";

/** "/a/b/c.yaml" -> "/a/b/" */
function dirname(url: string): string {
  const u = new URL(url, location.origin);
  const parts = u.pathname.split("/");
  if (parts.at(-1)?.includes(".")) parts.pop();
  return parts.join("/") + "/";
}

const isCharaPos = (v: unknown): v is "left" | "center" | "right" =>
  v === "left" || v === "center" || v === "right";

/** ---- type guards / asserts ---- */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isString(v: unknown): v is string { return typeof v === "string"; }
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function isScalar(v: unknown): v is boolean | number | string {
  return typeof v === "boolean" || typeof v === "number" || typeof v === "string";
}
export function isLineObject(x: Line): x is LineObject {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function fail(path: string, msg: string): never {
  throw new Error(`${path}: ${msg}`);
}
function assert(cond: unknown, path: string, msg: string): asserts cond {
  if (!cond) fail(path, msg);
}

/** ---- validate characters ---- */
function validateCharacters(root: Record<string, unknown>): Record<string, Character> | undefined {
  const src = root["characters"];
  if (src == null) return undefined;
  assert(isPlainObject(src), "characters", "must be an object map");

  const out: Record<string, Character> = {};
  for (const [key, val] of Object.entries(src)) {
    assert(isPlainObject(val), `characters.${key}`, "must be an object");
    const name = val["name"];
    assert(isString(name) && name.trim().length > 0, `characters.${key}.name`, "required string");
    const color = val["color"];
    if (color != null) assert(isString(color), `characters.${key}.color`, "must be string");
    const chara = val["chara"];
    if (chara != null) assert(isString(chara), `characters.${key}.chara`, "must be string");
    const pos = val["pos"];
    if (pos != null) assert(isCharaPos(pos), `characters.${key}.pos`, `must be "left"|"center"|"right"`);

    out[key] = {
      name,
      color: color as string | undefined,
      chara: chara as string | undefined,
      pos: pos as CharaPos
    };
  }
  return out;
}

/** ---- validate choice item ---- */
function validateChoiceItem(v: unknown, path: string): ChoiceItem {
  assert(isPlainObject(v), path, "must be an object");
  const text = v["text"];
  const goto = v["goto"];
  assert(isString(text) && text.trim(), `${path}.text`, "required string");
  assert(isString(goto) && goto.trim(), `${path}.goto`, "required string");

  const item: ChoiceItem = { text, goto };

  const setV = v["set"];
  if (setV != null) {
    assert(isPlainObject(setV), `${path}.set`, "must be an object of scalars");
    const setObj: Record<string, boolean | number | string> = {};
    for (const [k, val] of Object.entries(setV)) {
      assert(isScalar(val), `${path}.set.${k}`, "must be boolean/number/string");
      setObj[k] = val as boolean | number | string;
    }
    item.set = setObj;
  }

  const req = v["require"];
  if (req != null) {
    assert(isString(req) || isStringArray(req), `${path}.require`, "string or string[]");
    item.require = req as string | string[];
  }
  const reqN = v["requireNot"];
  if (reqN != null) {
    assert(isString(reqN) || isStringArray(reqN), `${path}.requireNot`, "string or string[]");
    item.requireNot = reqN as string | string[];
  }

  return item;
}

/** ---- validate one line object & collect labels ---- */
function validateLineObject(
  obj: Record<string, unknown>,
  path: string,
  labels: Set<string>
): LineObject {
  // 許可キー: bg, chara, narrator, sfx, bgm, wait, label, goto, choice, actors
  // それ以外は「スピーカー名」として扱い、値は string 必須
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(obj)) {
    switch (k) {
      case "bg":
      case "sfx":
      case "wait":
      case "narrator":
      case "goto":
        if (v != null) assert(isString(v), `${path}.${k}`, "must be string");
        out[k] = v;
        break;
      case "bgm":
        if (v != null) {
          assert(isString(v), `${path}.bgm`, 'must be string (file path) or "stop"');
        }
        out[k] = v;
        break;
      case "chara":
        if (v === null || v === undefined) {
          out[k] = null;
        } else {
          assert(isString(v), `${path}.chara`, "must be string (path) or null");
          out[k] = v;
        }
        break;
      case "label":
        assert(isString(v) && v.trim(), `${path}.label`, "non-empty string required");
        labels.add(v.trim());
        out[k] = v;
        break;
      case "choice":
        assert(Array.isArray(v), `${path}.choice`, "must be an array");
        out[k] = (v as unknown[]).map((it, i) => validateChoiceItem(it, `${path}.choice[${i}]`));
        break;
      case "actors": {
        assert(isPlainObject(v), `${path}.actors`, "must be an object map");
        const objActors = v as Record<string, unknown>;
        const validated: Record<string, { show?: boolean; pos?: "left" | "center" | "right"; chara?: string }> = {};
        for (const [who, spec] of Object.entries(objActors)) {
          assert(isString(who) && who.trim(), `${path}.actors`, "character key must be string");
          assert(isPlainObject(spec), `${path}.actors.${who}`, "must be an object");
          const show = spec["show"];
          if (show !== undefined) assert(typeof show === "boolean", `${path}.actors.${who}.show`, "must be boolean");
          const pos = spec["pos"];
          if (pos !== undefined) assert(isCharaPos(pos), `${path}.actors.${who}.pos`, `must be "left"|"center"|"right"`);
          const chara = spec["chara"];
          if (chara !== undefined) assert(isString(chara), `${path}.actors.${who}.chara`, "must be string");
          validated[who] = { show: show as boolean | undefined, pos: pos as CharaPos | undefined, chara: chara as string | undefined };
        }
        out[k] = validated;
        break;
      }
      default:
        // speaker line
        assert(isString(v), `${path}.${k}`, "speaker line value must be string");
        out[k] = v;
    }
  }

  return out as LineObject;
}

/** ---- validate story blocks & link goto/labels ---- */
type LabelMap = Map<string, Set<string>>;

function validateAndLinkStory(raw: unknown, basePath: string): { story: StoryBlock[]; labels: LabelMap } {
  assert(Array.isArray(raw), basePath, "must be an array of blocks");

  const story: StoryBlock[] = [];
  const names = new Set<string>();
  const labelMap: LabelMap = new Map();

  // 1st pass: validate blocks & collect labels
  raw.forEach((b, i) => {
    const p = `${basePath}[${i}]`;
    assert(isPlainObject(b), p, "must be an object");
    const nameRaw = b["name"];
    const name = isString(nameRaw) && nameRaw.trim() ? nameRaw.trim() : `block${i}`;
    assert(!names.has(name), `${p}.name`, `duplicate block name "${name}"`);
    names.add(name);

    const linesRaw = b["lines"];
    assert(Array.isArray(linesRaw), `${p}.lines`, "must be an array");

    const labels = new Set<string>();
    const lines: Line[] = (linesRaw as unknown[]).map((ln, j) => {
      const lp = `${p}.lines[${j}]`;
      if (isString(ln)) return ln;
      assert(isPlainObject(ln), lp, "must be a string or object");
      return validateLineObject(ln, lp, labels);
    });

    labelMap.set(name, labels);
    story.push({ name, lines });
  });

  // 2nd pass: verify goto targets (block / block#label / label-in-current)
  const hasBlock = (n: string) => names.has(n);
  const hasLabel = (block: string, lab: string) => labelMap.get(block)?.has(lab) ?? false;

  story.forEach((block) => {
    block.lines.forEach((ln, j) => {
      if (!isLineObject(ln)) return;
      const p = `${basePath}.${block.name}.lines[${j}]`;

      const checkGoto = (val: string, hereBlock: string, path: string) => {
        const s = val.trim();
        const h = s.indexOf("#");
        if (h >= 0) {
          const b = s.slice(0, h).trim();
          const lab = s.slice(h + 1).trim();
          assert(b.length > 0, path, "block name before # must be non-empty");
          assert(hasBlock(b), path, `unknown block "${b}"`);
          if (lab) assert(hasLabel(b, lab), path, `unknown label "${lab}" in block "${b}"`);
        } else {
          if (hasBlock(s)) return; // block先頭
          assert(hasLabel(hereBlock, s), path, `unknown label "${s}" in current block "${hereBlock}"`);
        }
      };

      if (ln.goto && isString(ln.goto)) {
        checkGoto(ln.goto, block.name, `${p}.goto`);
      }
      if (Array.isArray(ln.choice)) {
        ln.choice.forEach((c, idx) => checkGoto(c.goto, block.name, `${p}.choice[${idx}].goto`));
      }
    });
  });

  return { story, labels: labelMap };
}

/* ============================================================
 *  コア：オブジェクト→Script に“検証して”変換する（fetch なし）
 * ============================================================ */
function buildScriptFromRoot(root: Record<string, unknown>, baseDir: string): Script {
  if (root["id"] != null) assert(isString(root["id"]), "id", "must be string");
  if (root["title"] != null) assert(isString(root["title"]), "title", "must be string");

  const characters = validateCharacters(root);

  const storyRaw = root["story"];
  const { story } = validateAndLinkStory(storyRaw, "story");

  return {
    id: String((root["id"] as string | undefined) ?? "story"),
    title: root["title"] as string | undefined,
    characters,
    story,
    baseDir,
  };
}

/* ============================================================
 *  公開 API
 * ============================================================ */

/**
 * YAML テキストを受け取り、検証済み Script を返す（fetch なし）。
 * sourceUrl（任意）を渡すと baseDir をその URL から計算。
 * 省略時 baseDir は ""。
 */
export function parseScriptYAML(text: string, opts?: { sourceUrl?: string; baseDir?: string }): Script {
  const rootUnknown: unknown = yaml.load(text);
  assert(isPlainObject(rootUnknown), "root", "YAML root must be an object");
  const root = rootUnknown as Record<string, unknown>;
  const baseDir =
    opts?.baseDir ??
    (opts?.sourceUrl ? dirname(opts.sourceUrl) : "");
  return buildScriptFromRoot(root, baseDir);
}

/**
 * 既にパース済みの root オブジェクトを検証して Script を返す（fetch なし）。
 * baseDir を明示的に指定できる。
 */
export function validateScriptObject(rootUnknown: unknown, opts?: { baseDir?: string }): Script {
  assert(isPlainObject(rootUnknown), "root", "YAML root must be an object");
  const root = rootUnknown as Record<string, unknown>;
  const baseDir = opts?.baseDir ?? "";
  return buildScriptFromRoot(root, baseDir);
}

/**
 * YAML テキストを検証だけ行いたい場合のユーティリティ（例：エディタ側の即時検証）。
 * 例外を投げずに結果を返す。
 */
export function tryValidateScriptYAML(
  text: string,
  opts?: { sourceUrl?: string; baseDir?: string }
): { ok: true; script: Script } | { ok: false; error: string } {
  try {
    const script = parseScriptYAML(text, opts);
    return { ok: true, script };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * 旧来の URL 読み込み（fetch あり）エントリ。
 * 取得後は parseScriptYAML で検証・構築。
 */
export async function loadScript(url: string): Promise<Script> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load script: ${url}`);
  const text = await res.text();
  // url から baseDir を導出
  return parseScriptYAML(text, { sourceUrl: url });
}
