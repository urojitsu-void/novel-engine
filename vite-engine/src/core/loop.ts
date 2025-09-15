// src/core/loop.ts
import { Script, EngineState, Line, LineObject, ChoiceItem, ActorDirective, CharaPos } from "../types";
import { TextUI } from "../ui/text";
import { fadeSwap } from "../ui/visuals";
import { extractSpeakers, resolveAsset } from "../assets/assets";
import { isLineObject } from "../scripts/parser";
import { ChoiceUI } from "../ui/choice";
import { AudioBus } from "../ui/audio";
import { CharasLayer } from "../ui/charas";

type Pause = boolean; // true=ここで一旦停止（ユーザー操作/タイマー待ち）、false=自動で次の行へ

export class VNEngine {
  private idx = 0;
  private state: EngineState = { speaker: "narrator", bg: "" };

  private currentBlock: string;
  private blocks = new Map<string, Line[]>();
  private labelIndex = new Map<string, Map<string, number>>();

  private flags: Record<string, boolean | number | string> = {};
  private waitingChoice = false;
  private waitTimer: number | null = null;

  public isAutoplaying = false;
  private autoplayTimer: number | null = null;
  private autoplayDelay = 2000; // テキスト表示後の待機時間 (ms)
  public autoplayChoice = true; // オートプレイ中の選択肢を自動選択するか
  private isPausedOnText = false;

  private audio: AudioBus;
  private charas: CharasLayer;

  /** 台詞フック: speak() の最後で呼ばれる */
  public onSpeak?: (speaker: string, text: string) => void;

  constructor(
    private script: Script,
    private textUI: TextUI,
    private bgEl: HTMLImageElement,
    charasEl: HTMLDivElement,
    private choiceUI?: ChoiceUI,
    audioBus?: AudioBus
  ) {
    script.story.forEach((b) => this.blocks.set(b.name, b.lines));
    this.currentBlock = this.blocks.has("main") ? "main" : script.story[0]?.name ?? "main";
    this.indexLabels();
    this.audio = audioBus ?? new AudioBus();
    this.charas = new CharasLayer(charasEl);
  }

  /** 任意：必要なら外から呼ぶ（今のAudioBusが自動再生試行型なら不要） */
  unlockAudio() { this.audio.unlock?.(); }

  // ===== オートプレイ制御 =====
  public startAutoplay(delay: number = this.autoplayDelay) {
    this.autoplayDelay = delay;
    if (this.isAutoplaying) return;
    this.isAutoplaying = true;
    document.body.classList.add('autoplay');
    if (this.isPausedOnText && !this.textUI.isTyping) {
      this.scheduleAutoplay();
    }
  }

  public stopAutoplay() {
    this.isAutoplaying = false;
    document.body.classList.remove('autoplay');
    if (this.autoplayTimer) {
      clearTimeout(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }

  public toggleAutoplay(delay?: number) {
    if (this.isAutoplaying) {
      this.stopAutoplay();
    } else {
      this.startAutoplay(delay);
    }
  }

  // ===== インデックス系 =====
  private get lines(): Line[] { return this.blocks.get(this.currentBlock) ?? []; }

  private indexLabels() {
    this.labelIndex.clear();
    for (const [bk, arr] of this.blocks) {
      const map = new Map<string, number>();
      map.set(bk, 0);
      arr.forEach((ln, i) => {
        if (isLineObject(ln) && typeof ln.label === "string" && ln.label.trim()) {
          map.set(ln.label.trim(), Math.min(i + 1, arr.length));
        }
      });
      this.labelIndex.set(bk, map);
    }
  }

  // ===== 進行制御 =====
  next() {
    if (this.waitingChoice) return;
    this.isPausedOnText = false; // nextが呼ばれたらリセット
    if (this.autoplayTimer) { clearTimeout(this.autoplayTimer); this.autoplayTimer = null; }

    // 「止まる必要がない行」は自動で連続消化する
    let guard = 0;
    while (this.idx < this.lines.length && guard++ < 1000) {
      const line = this.lines[this.idx++];
      const shouldPause = this.execLine(line);
      if (shouldPause) break;
    }
  }

  back() {
    if (this.waitingChoice) return;
    if (this.waitTimer) { clearTimeout(this.waitTimer); this.waitTimer = null; }
    if (this.autoplayTimer) { clearTimeout(this.autoplayTimer); this.autoplayTimer = null; }
    if (this.idx <= 1) return;
    this.idx = Math.max(0, this.idx - 2);
    this.next();
  }

  completeOrNext() {
    if (this.waitingChoice) return;
    if (this.autoplayTimer) { clearTimeout(this.autoplayTimer); this.autoplayTimer = null; }
    this.textUI.completeOr(() => this.next());
  }

  // ===== goto 解析 =====
  private switchBlock(block: string, at = 0) {
    if (!this.blocks.has(block)) return;
    this.currentBlock = block;
    this.idx = at;
  }
  private jumpWithin(block: string, label: string): boolean {
    const pos = this.labelIndex.get(block)?.get(label);
    if (pos !== undefined) { this.idx = pos; return true; }
    return false;
  }
  private resolveGotoTarget(goto: string) {
    const hash = goto.indexOf("#");
    if (hash >= 0) {
      const block = goto.slice(0, hash).trim();
      const label = goto.slice(hash + 1).trim();
      if (this.blocks.has(block)) {
        this.switchBlock(block, 0);
        if (label) this.jumpWithin(block, label);
      }
      return;
    }
    if (this.blocks.has(goto)) { this.switchBlock(goto, 0); return; }
    this.jumpWithin(this.currentBlock, goto);
  }

  // ===== 選択肢 可視判定/適用 =====
  private isChoiceVisible(it: ChoiceItem): boolean {
    const req = Array.isArray(it.require) ? it.require : it.require ? [it.require] : [];
    const reqN = Array.isArray(it.requireNot) ? it.requireNot : it.requireNot ? [it.requireNot] : [];
    const ok1 = req.every((k) => !!this.flags[k]);
    const ok2 = reqN.every((k) => !this.flags[k]);
    return ok1 && ok2;
  }
  private applyChoiceFlags(set?: Record<string, boolean | number | string>) {
    if (!set) return;
    Object.entries(set).forEach(([k, v]) => { this.flags[k] = v; });
  }
  private gotoFromChoice(goto?: string) {
    if (goto) this.resolveGotoTarget(goto);
    // ChoiceUI なし（prompt）の時は即進行、ありの時は show 側で進める
    if (!this.choiceUI) this.next();
  }

  // ===== オートプレイのスケジューリング =====
  private scheduleAutoplay() {
    if (!this.isAutoplaying || this.waitingChoice || this.waitTimer) {
      return;
    }
    if (this.autoplayTimer) clearTimeout(this.autoplayTimer);

    // タイピング完了後、指定された待機時間で次へ
    this.autoplayTimer = window.setTimeout(() => {
      this.autoplayTimer = null;
      if (this.isAutoplaying) this.next();
    }, this.autoplayDelay);
  }

  // ===== wait の解析（"500", "500ms", "0.5s" を許容）===== 
  private parseWait(v: string): number | null {
    const s = v.trim().toLowerCase();
    if (/^\d+$/.test(s)) return Math.max(0, parseInt(s, 10));
    const ms = s.match(/^(\d+(?:\.\d+)?)\s*ms$/);
    if (ms) return Math.max(0, Math.round(parseFloat(ms[1])));
    const sec = s.match(/^(\d+(?:\.\d+)?)\s*s(ec(?:onds?)?)?$/);
    if (sec) return Math.max(0, Math.round(parseFloat(sec[1]) * 1000));
    return null;
  }

  // ===== 1行実行：戻り値 true=停止 / false=継続 =====
  private execLine(line: Line): Pause {
    if (!isLineObject(line)) {
      // 純テキスト：ここで停止（ユーザー操作待ち）
      this.speak(this.state.speaker, line);
      this.charas.focus(null);
      return true;
    }

    // choice（表示したら停止）
    if (Array.isArray(line.choice) && line.choice.length > 0) {
      const visible = line.choice.filter((it) => this.isChoiceVisible(it));
      if (visible.length === 0) return false; // 何も出せないなら継続

      // オートプレイ中かつ自動選択が有効なら、最初の選択肢を選ぶ
      if (this.isAutoplaying && this.autoplayChoice) {
        if (this.choiceUI) {
          this.waitingChoice = true;
          this.choiceUI.showAndAutopick(visible, 0, (i) => {
            const picked = visible[i];
            this.choiceUI!.hide();
            this.waitingChoice = false;
            this.applyChoiceFlags(picked?.set);
            this.gotoFromChoice(picked?.goto);
            this.next();
          });
          return true; // UIに任せて停止
        } else {
          // choiceUIがない場合は即時選択
          const picked = visible[0];
          this.applyChoiceFlags(picked?.set);
          this.gotoFromChoice(picked?.goto);
          return false; // 自動選択したので継続
        }
      }

      this.stopAutoplay(); // 選択肢表示時はオートプレイを止める
      if (this.choiceUI) {
        this.waitingChoice = true;
        this.choiceUI.show(visible, (i) => {
          const picked = visible[i];
          this.choiceUI!.hide();
          this.waitingChoice = false;
          this.applyChoiceFlags(picked?.set);
          this.gotoFromChoice(picked?.goto);
          this.next(); // 選択直後に自動で次へ（ここでも“連続消化”が効く）
        });
      } else {
        const ans = Number(prompt(visible.map((c, i) => `${i + 1}. ${c.text}`).join("\n")) || "0") - 1;
        const picked = visible[ans];
        this.applyChoiceFlags(picked?.set);
        this.gotoFromChoice(picked?.goto);
      }
      return true;
    }

    // まず actors（複数キャラ制御）を適用
    if ((line as LineObject).actors) {
      this.applyActors((line as LineObject).actors as Record<string, ActorDirective>);
    }

    // goto（ジャンプして継続）
    if (typeof line.goto === "string" && line.goto.trim()) {
      this.resolveGotoTarget(line.goto.trim());
      return false;
    }

    // wait（タイマーで次へ、ここで停止）
    if (typeof line.wait === "string") {
      const ms = this.parseWait(line.wait);
      if (ms != null) {
        if (this.waitTimer) { clearTimeout(this.waitTimer); this.waitTimer = null; }
        this.waitTimer = window.setTimeout(() => {
          this.waitTimer = null;
          this.next();
        }, ms);
        return true;
      }
    }

    // BGM / SFX（継続）
    if (line.bgm !== undefined) {
      if (line.bgm === "stop") this.audio.stopBGM({ fadeMs: 200 });
      else if (typeof line.bgm === "string") {
        const src = resolveAsset(this.script.baseDir, line.bgm);
        this.audio.playBGM(src, { loop: true, volume: 0.6, fadeMs: 300 });
      }
    }
    if (typeof line.sfx === "string") {
      const src = resolveAsset(this.script.baseDir, line.sfx);
      this.audio.playSFX(src, { volume: 1 });
    }

    // 背景 / 立ち絵（継続）
    if (typeof line.bg === "string") {
      const src = resolveAsset(this.script.baseDir, line.bg);
      this.state.bg = src; fadeSwap(this.bgEl, src);
    }

    // テキスト（表示があれば停止 / なければ継続）
    if (typeof line.narrator === "string") {
      this.speak("narrator", line.narrator);
      this.charas.focus(null);
      return true;
    }
    const speakers = extractSpeakers(line as LineObject);
    if (speakers.length > 0) {
      const sp = speakers[0];
      const text = (line as LineObject)[sp];
      // 話者が未表示ならデフォで出す
      if (!this.charas.has(sp)) {
        const info = this.script.characters?.[sp];
        if (info?.chara) {
          const src = resolveAsset(this.script.baseDir, info.chara);
          const pos: CharaPos = info.pos ?? "center";
          this.charas.show(sp, src, pos);
        }
      }
      // 話者にフォーカス（他は半透明）
      this.charas.focus(sp);
      this.speak(sp, text);
      return true;
    }

    // 何も表示するものが無ければ継続
    return false;
  }


  private speak(speaker: string, text: string) {
    this.state.speaker = speaker || "narrator";
    this.textUI.setSpeaker(this.state.speaker, this.script.characters ?? {});

    // onSpeak の Promise を拾って保持
    const hookP = this.onSpeak?.(this.state.speaker, text);

    // タイピング完了後に、hook があればそれを待ってからオート送りをスケジュール
    this.textUI.typeTo(text, async () => {
      try {
        if (hookP) {
          await hookP; // ★ ツッコミ完全終了まで待つ
        }
      } finally {
        this.scheduleAutoplay(); // isAutoplaying 等の条件は既存のまま機能
      }
    });

    this.isPausedOnText = true;
  }

  private applyActors(upd: Record<string, ActorDirective>) {
    for (const [who, spec] of Object.entries(upd)) {
      const info = this.script.characters?.[who];
      if (!info) continue;

      const visible = this.charas.has(who);

      // 1) 明示的に非表示
      if (spec.show === false) {
        this.charas.hide(who);
        continue;
      }

      // 2) 表示/更新（どれか一つでも指定があれば更新対象）
      const wantsUpdate =
        spec.show === true || typeof spec.chara === "string" || spec.pos !== undefined;
      if (!wantsUpdate) continue;

      const posWanted: CharaPos = (spec.pos ?? info.pos ?? "center") as CharaPos;

      if (typeof spec.chara === "string") {
        // 画像と位置を同時に更新（既に表示中でもOK）
        const src = resolveAsset(this.script.baseDir, spec.chara);
        this.charas.show(who, src, posWanted);
      } else if (visible) {
        // 位置だけ更新
        this.charas.setPos(who, posWanted);
      } else {
        // 未表示 → デフォ画像で出す（位置は posWanted）
        if (info.chara) {
          const src = resolveAsset(this.script.baseDir, info.chara);
          this.charas.show(who, src, posWanted);
        }
      }
    }
  }
}