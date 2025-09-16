// src/ui/choice.ts
import type { ChoiceItem } from "../types";

export class ChoiceUI {
  private root: HTMLElement;
  private onPick: ((idx: number) => void) | null = null;
  private blinkMs = 300;
  private isShowing = false;

  constructor(root: HTMLElement, opts?: { blinkMs?: number }) {
    this.root = root;
    if (opts?.blinkMs) this.blinkMs = opts.blinkMs;
    this.hide();
  }

  show(choices: ChoiceItem[], onPick: (idx: number) => void) {
    this.isShowing = true;
    this.onPick = onPick;
    this.root.innerHTML = "";
    this.root.style.display = "block";

    choices.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = c.text ?? `選択肢 ${i + 1}`;
      btn.addEventListener("click", () => this.pickWithBlink(i));
      this.root.appendChild(btn);
    });
  }

  hide() {
    this.isShowing = false;
    this.root.style.display = "none";
    this.root.innerHTML = "";
    this.onPick = null;
  }

  /** オートプレイ用：インデックス指定で自動選択（点滅→遷移） */
  showAndAutopick(choices: ChoiceItem[], index: number, onPicked: (idx: number) => void) {
    this.show(choices, onPicked);
    // レイアウト後に点滅開始
    requestAnimationFrame(() => this.pickWithBlink(index));
  }

  /** 点滅演出 → hide → onPick を呼ぶ */
  private pickWithBlink(index: number) {
    if (!this.isShowing) return;
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>(".choice-btn"));
    const target = buttons[index];
    if (!target) return;

    // 多重操作を防ぐ
    buttons.forEach((b) => (b.disabled = true));
    target.classList.add("flash");

    window.setTimeout(() => {
      target.classList.remove("flash");
      const cb = this.onPick;
      this.hide();
      this.onPick = null;
      if (cb) cb(index);
    }, this.blinkMs);
  }

}
