import { Character } from "../types";

export type TypingState = {
  inProgress: boolean;
  fullText: string;
  timer?: number;
  speedMs: number;
  onComplete?: () => void;
};

export class TextUI {
  private typing: TypingState = { inProgress: false, fullText: "", speedMs: 18, onComplete: undefined };
  constructor(private textEl: HTMLDivElement, private nameBoxEl: HTMLDivElement) { }

  public get isTyping(): boolean { return this.typing.inProgress; }

  setSpeaker(speaker: string, chars: Record<string, Character>) {
    if (speaker === "narrator") {
      this.nameBoxEl.style.display = "none";
      return;
    }
    const info = chars[speaker];
    this.nameBoxEl.style.display = "block";
    this.nameBoxEl.textContent = info?.name ?? speaker;
    this.nameBoxEl.style.color = info?.color ?? "white";
  }
  clearTyping() {
    this.typing.inProgress = false;
    this.typing.fullText = "";
    this.typing.onComplete = undefined;
    if (this.typing.timer !== undefined) {
      window.clearTimeout(this.typing.timer);
      this.typing.timer = undefined;
    }
  }
  typeTo(text: string, onComplete?: () => void) {
    this.clearTyping();
    this.typing.inProgress = true;
    this.typing.fullText = text;
    this.typing.onComplete = onComplete;
    this.textEl.textContent = "";
    let i = 0;
    const step = () => {
      if (!this.typing.inProgress) return;
      this.textEl.textContent = this.typing.fullText.slice(0, i);
      i += 1;
      if (i <= this.typing.fullText.length) {
        this.typing.timer = window.setTimeout(step, this.typing.speedMs);
        return;
      }
      this.typing.inProgress = false;
      this.typing.onComplete?.();
    };
    step();
  }
  completeOr(next: () => void) {
    if (this.typing.inProgress) {
      const { onComplete } = this.typing;
      this.clearTyping(); // this clears onComplete
      this.textEl.textContent = this.typing.fullText;
      onComplete?.();
      return;
    }
    next();
  }
}
