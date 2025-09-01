// src/ui/audio.ts
export class AudioBus {
  private bgm: HTMLAudioElement | null = null;
  private unlocked = false;
  private pending: (() => void)[] = [];

  /** 最初のユーザー操作で呼ぶ（autoplay解除） */
  unlock() {
    this.unlocked = true;
    this.pending.splice(0).forEach(fn => fn());
    // BGMが止まっていたら再開
    if (this.bgm && this.bgm.paused) this.bgm.play().catch(() => { });
  }

  async playBGM(src: string, opts: { loop?: boolean; volume?: number; fadeMs?: number } = {}) {
    const { loop = true, volume = 0.6, fadeMs = 300 } = opts;

    const run = async () => {
      if (this.bgm) await this.stopBGM({ fadeMs: 200 });
      this.bgm = new Audio(src);
      this.bgm.loop = loop;
      this.bgm.volume = 0;
      await this.bgm.play().catch(() => { }); // ブロック時は unlock 待ちでOK
      await fadeTo(this.bgm!, volume, fadeMs);
    };

    if (!this.unlocked) {
      this.pending.push(run);
      return;
    }
    await run();
  }

  async stopBGM(opts: { fadeMs?: number } = {}) {
    const { fadeMs = 200 } = opts;
    if (!this.bgm) return;
    await fadeTo(this.bgm, 0, fadeMs);
    this.bgm.pause();
    this.bgm = null;
  }

  async playSFX(src: string, opts: { volume?: number } = {}) {
    const job = async () => {
      const a = new Audio(src);
      a.volume = opts.volume ?? 1;
      await a.play().catch(() => { });
    };
    if (!this.unlocked) {
      this.pending.push(job);
      return;
    }
    await job();
  }
}

async function fadeTo(el: HTMLAudioElement, target: number, ms: number) {
  const start = el.volume;
  const steps = Math.max(1, Math.floor(ms / 16));
  for (let i = 1; i <= steps; i++) {
    el.volume = start + (target - start) * (i / steps);
    await new Promise(r => setTimeout(r, 16));
  }
  el.volume = target;
}
