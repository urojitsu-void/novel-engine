import type { CharaPos } from "../types";

export class CharasLayer {
  private sprites = new Map<string, HTMLImageElement>();
  constructor(private host: HTMLElement) { }

  show(id: string, src: string, pos: CharaPos) {
    let img = this.sprites.get(id);
    if (!img) {
      img = document.createElement("img");
      img.className = "chara-sprite";
      img.decoding = "async";
      img.loading = "eager";
      img.style.opacity = "0";
      this.host.appendChild(img);
      this.sprites.set(id, img);
      requestAnimationFrame(() => { img!.style.opacity = "1"; });
    }
    img.src = src;
    img.classList.remove("pos-left", "pos-center", "pos-right");
    img.classList.add(pos === "left" ? "pos-left" : pos === "right" ? "pos-right" : "pos-center");
    this.setPos(id, pos);
  }

  /** 位置だけ変更（画像はそのまま） */
  setPos(id: string, pos: CharaPos) {
    const img = this.sprites.get(id);
    if (!img) return;
    img.classList.remove("pos-left", "pos-center", "pos-right");
    img.classList.add(pos === "left" ? "pos-left" : pos === "right" ? "pos-right" : "pos-center");
  }

  hide(id: string) {
    const img = this.sprites.get(id);
    if (!img) return;
    img.style.opacity = "0";
    setTimeout(() => { img.remove(); this.sprites.delete(id); }, 200);
  }

  clear() { for (const id of Array.from(this.sprites.keys())) this.hide(id); }

  focus(active: string | null, dimOpacity = 0.45) {
    for (const [id, img] of this.sprites) {
      if (active && id !== active) img.style.opacity = String(dimOpacity);
      else img.style.opacity = "1";
    }
  }

  has(id: string) { return this.sprites.has(id); }
}
