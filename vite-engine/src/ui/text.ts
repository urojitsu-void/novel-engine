// src/ui/text.ts
import { Character } from "../types";

export type TypingState = {
  inProgress: boolean;
  fullText: string;
  timer?: number;
  speedMs: number;
  onComplete?: () => void;
};

export class TextUI {
  private typing: TypingState = {
    inProgress: false,
    fullText: "",
    speedMs: 50,
    onComplete: undefined,
  };

  constructor(
    private textEl: HTMLDivElement,
    private nameBoxEl: HTMLDivElement
  ) { }

  public get isTyping(): boolean {
    return this.typing.inProgress;
  }

  setSpeaker(speaker: string, chars: Record<string, Character>) {
    if (speaker === "narrator") {
      this.nameBoxEl.style.display = "none";
      this.nameBoxEl.textContent = "";
      return;
    }
    const info = chars[speaker];
    this.nameBoxEl.style.display = "block";
    this.nameBoxEl.textContent = info?.name ?? speaker;
    this.nameBoxEl.style.color = info?.color ?? "white";
  }

  /** タイピング速度を変更（ms/文字） */
  setSpeed(msPerChar: number) {
    this.typing.speedMs = Math.max(5, Math.floor(msPerChar));
  }

  /** 進行中のタイピングを完全停止（テキストは触らない） */
  private stopTimer() {
    if (this.typing.timer !== undefined) {
      window.clearTimeout(this.typing.timer);
      this.typing.timer = undefined;
    }
  }

  /** 今のテキストを“即全文表示”にして、タイピングを終了 */
  private finishTyping(callOnComplete = true) {
    this.stopTimer();
    this.typing.inProgress = false;
    this.textEl.textContent = this.typing.fullText; // ← 先に fullText を使う
    const cb = this.typing.onComplete;
    this.typing.onComplete = undefined;
    if (callOnComplete) cb?.();
  }

  /** 文字送り開始 */
  typeTo(text: string, onComplete?: () => void) {
    // 既存を停止
    this.stopTimer();
    this.typing.inProgress = false;

    this.typing.fullText = text ?? "";
    this.typing.onComplete = onComplete;
    this.textEl.textContent = "";

    if (this.typing.fullText.length === 0) {
      // 空文は即完了
      this.finishTyping(true);
      return;
    }

    this.typing.inProgress = true;
    let i = 0;

    const step = () => {
      if (!this.typing.inProgress) return;

      i++;
      // i を 1..len に保ち、slice(0, i) で1文字ずつ増える
      const len = this.typing.fullText.length;
      if (i >= len) {
        this.textEl.textContent = this.typing.fullText;
        this.finishTyping(true);
        return;
      } else {
        this.textEl.textContent = this.typing.fullText.slice(0, i);
      }

      this.typing.timer = window.setTimeout(step, this.typing.speedMs);
    };

    // 最初の1文字を出してスタート
    step();
  }

  /**
   * 途中クリック時の挙動：
   *  - タイピング中なら「全文表示だけ」して終了（次行へは進めない）
   *  - 既に全文表示済みなら next() を呼ぶ
   */
  completeOr(next: () => void) {
    if (this.typing.inProgress) {
      // ★ 重要：clearTypingは使わない（fullTextが消えるため）
      this.finishTyping(true);
      return;
    }
    next();
  }
}
