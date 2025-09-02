// src/ui/choice.ts
import type { ChoiceItem } from "../types";

export class ChoiceUI {
  private container: HTMLDivElement;

  constructor(host: HTMLElement) {
    // host は #choices を渡してください
    this.container = host as HTMLDivElement;
    this.container.style.display = "none";
  }

  show(items: ChoiceItem[], onPick: (index: number) => void) {
    this.container.innerHTML = "";
    this.container.style.display = "block";

    items.forEach((it, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.type = "button";
      btn.textContent = it.text;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();     // ★ これが効きます（body へバブルさせない）
        onPick(i);
      });
      this.container.appendChild(btn);
    });
  }

  hide() {
    this.container.style.display = "none";
    this.container.innerHTML = "";
  }

  showAndAutopick(items: ChoiceItem[], pickIndex: number, onPick: (index: number) => void, delay = 1000) {
    this.container.innerHTML = "";
    this.container.style.display = "block";

    items.forEach((it, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.type = "button";
      btn.textContent = it.text;
      btn.disabled = true; // prevent user interaction
      if (i === pickIndex) {
        btn.classList.add("autopicked");
      }
      this.container.appendChild(btn);
    });

    setTimeout(() => {
      onPick(pickIndex);
    }, delay);
  }
}
