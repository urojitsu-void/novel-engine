import { Script, Line, LineObject, ControlKeys } from "../types";
import { isLineObject } from "../script/parser";

const CONTROL_KEY_SET = new Set<keyof ControlKeys>(["bg", "chara", "narrator", "sfx", "bgm", "wait", "actors"]);

export function resolveAsset(baseDir: string, ref: string): string {
  if (!ref) return ref;
  if (ref.startsWith("http")) return ref;
  if (ref.startsWith("/")) return ref;
  return new URL(ref, location.origin + baseDir).pathname;
}

export function collectAssets(script: Script): Set<string> {
  const set = new Set<string>();
  Object.values(script.characters ?? {}).forEach((c) =>
    c.chara && set.add(resolveAsset(script.baseDir, c.chara))
  );
  script.story.map((s) => s.lines.forEach((l: Line) => {
    if (isLineObject(l)) {
      if (typeof l.bg === "string")
        set.add(resolveAsset(script.baseDir, l.bg));
      if (typeof l.chara === "string")
        set.add(resolveAsset(script.baseDir, l.chara));
      if (typeof l.bgm === "string")
        set.add(resolveAsset(script.baseDir, l.bgm));
      if (typeof l.sfx === "string")
        set.add(resolveAsset(script.baseDir, l.sfx));
    }
  }));
  return set;
}

export function preloadAssets(set: Set<string>) {
  set.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}
export function extractSpeakers(obj: LineObject): string[] {
  return Object.keys(obj)
    .filter((k) => !CONTROL_KEY_SET.has(k as keyof ControlKeys));
}
