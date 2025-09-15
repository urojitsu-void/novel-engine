// src/ui/tsukkomiOverlay.ts
export type TsukkomiPayload = { name: string; text: string; image?: string };

export class TsukkomiOverlay {
  private root: HTMLElement;
  private avatar: HTMLElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;

  constructor(root?: HTMLElement | null) {
    // 既存DOMを必須にする
    this.root = (root ?? document.getElementById("tsukkomi-overlay")) as HTMLElement;
    if (!this.root) throw new Error("#tsukkomi-overlay not found in DOM");

    const av = this.root.querySelector(".avatar") as HTMLElement | null;
    const nm = this.root.querySelector(".name") as HTMLElement | null;
    const tx = this.root.querySelector(".text") as HTMLElement | null;
    if (!av || !nm || !tx) throw new Error("#tsukkomi-overlay: required children (.avatar,.name,.text) missing");

    this.avatar = av;
    this.nameEl = nm;
    this.textEl = tx;

    // 念のため初期状態は非表示
    this.root.style.display = "none";
  }

  show(p: TsukkomiPayload) {
    this.nameEl.textContent = p.name ?? "";
    this.textEl.textContent = p.text ?? "";
    if (p.image) {
      this.avatar.style.backgroundImage = `url("${p.image}")`;
    } else {
      this.avatar.style.backgroundImage = "";
    }
    this.root.style.display = "flex"; // ← 表示
  }

  hide() {
    this.root.style.display = "none"; // ← 非表示
  }
}
