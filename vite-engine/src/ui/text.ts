import { Character } from "../types";

export type TypingState = {
  inProgress: boolean;
  fullText: string;
  timer?: number;
  speedMs: number;
};

export class TextUI {
  private typing: TypingState = { inProgress: false, fullText: "", speedMs: 18 };
  constructor(private textEl: HTMLDivElement, private nameBoxEl: HTMLDivElement, private charaEl: HTMLImageElement) { }
  setSpeaker(speaker: string, chars: Record<string, Character>) {
    if (speaker === "narrator") {
      this.nameBoxEl.style.display = "none";
      this.showChara(null);
      return;
    }
    const info = chars[speaker];
    this.nameBoxEl.style.display = "block";
    this.nameBoxEl.textContent = info?.name ?? speaker;
    this.nameBoxEl.style.color = info?.color ?? "white";
  }
  showChara(src: string | null) {
    if (src) {
      this.charaEl.style.display = "block";
      this.charaEl.src = src;
      return;
    }
    this.charaEl.style.display = "none";
  }
  clearTyping() {
    this.typing.inProgress = false;
    this.typing.fullText = "";
    if (this.typing.timer !== undefined) {
      window.clearTimeout(this.typing.timer);
      this.typing.timer = undefined;
    }
  }
  typeTo(text: string) {
    this.clearTyping();
    this.typing.inProgress = true;
    this.typing.fullText = text;
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
    };
    step();
  }
  completeOr(next: () => void) {
    if (this.typing.inProgress) {
      this.clearTyping();
      this.textEl.textContent = this.typing.fullText;
      return;
    }
    next();
  }
}
