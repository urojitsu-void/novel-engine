// src/integrations/tsukkomi.ts
import axios, { type AxiosInstance } from "axios";
import { TsukkomiOverlay } from "../ui/tsukkomi";

/** VOICEVOX /speakers の型（必要部分のみ） */
type VvSpeaker = { name: string; styles: { id: number }[] };

/** 話者ごとのツッコミ人格（必要に応じて追記） */
const PERSONA_MAP: Record<string, string> = {
  "四国めたん": "軽妙なツッコミで短く返して。皮肉は弱め、10〜50字。",
  "ずんだもん": "〜なのだ、でテンポよくツッコミ。10〜50字。",
  "春日部つむぎ": "ギャル語まじりで小気味よくツッコんで。10〜50字。",
  "ぞん子": "ちょい強めのギャル口調でツッコミ。10〜50字。",
  "九州そら": "お姉さん調でやさしくツッコミ。10〜50字。",
  "春歌ナナ": "元気系ツッコミ。前向きで短く。10〜50字。",
  "冥鳴ひまり": "お嬢様ムーブの上品ツッコミ。10〜50字。",
  "玄野武宏": "素っ気ない系の短いツッコミ。10〜50字。",
  "Voidoll": "ロボ風カタコトでツッコミ。10〜50字。",
};

type PickedVoice = { name: string; persona: string; id: number };

export type TsukkomiConfig = {
  enabled?: boolean;
  includeNarrator?: boolean;   // 語り手にも反応するか
  minGapMs?: number;           // 連発防止間隔(ms)
  model?: string;              // Ollama モデル名
};

export type TsukkomiOptions = TsukkomiConfig & {
  /** 既存のオーバーレイDOMを操作するために渡す（任意） */
  overlay?: TsukkomiOverlay;
  /** 話者名 → アバター画像URL のマップ（任意） */
  avatarImages?: Record<string, string>;
  /** 直叩きホストを上書きしたい場合（任意） */
  vvHost?: string;         // 例: "http://127.0.0.1:50021"
  ollamaHost?: string;     // 例: "http://127.0.0.1:11434"
};

/** デフォルトの直叩きホスト */
const DEFAULT_VV_HOST = "http://127.0.0.1:50021";
const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

export class TsukkomiManager {
  // 設定
  private enabled = true;
  private includeNarrator = false;
  private minGapMs = 800;
  private model = "rolandroland/llama3.1-uncensored:latest";


  // 通信
  private vv: AxiosInstance;
  private ol: AxiosInstance;

  // 表示
  private overlay?: TsukkomiOverlay;
  private avatarImages?: Record<string, string>;

  // 状態
  private voice: PickedVoice | null = null;
  private lastAt = 0;

  constructor(opts: TsukkomiOptions = {}) {
    const {
      enabled, includeNarrator, minGapMs, model,
      overlay, avatarImages,
      vvHost = DEFAULT_VV_HOST,
      ollamaHost = DEFAULT_OLLAMA_HOST,
    } = opts;

    if (enabled !== undefined) this.enabled = enabled;
    if (includeNarrator !== undefined) this.includeNarrator = includeNarrator;
    if (minGapMs !== undefined) this.minGapMs = minGapMs;
    if (model) this.model = model;

    this.overlay = overlay;
    this.avatarImages = avatarImages;

    this.vv = axios.create({ baseURL: vvHost, timeout: 20_000, withCredentials: false });
    this.ol = axios.create({ baseURL: ollamaHost, timeout: 30_000, withCredentials: false });
  }

  setEnabled(on: boolean) { this.enabled = on; }
  setOverlay(overlay: TsukkomiOverlay) { this.overlay = overlay; }
  setAvatarImages(map: Record<string, string>) { this.avatarImages = map; }

  async init(): Promise<void> {
    if (!this.enabled || this.voice) return;

    const { data } = await this.vv.get<VvSpeaker[]>("/speakers");
    const usable = data.filter(s => PERSONA_MAP[s.name] && s.styles.length > 0);
    if (!usable.length) throw new Error("No VOICEVOX speakers matched.");

    const rnd = usable[Math.floor(Math.random() * usable.length)];
    const style = rnd.styles[Math.floor(Math.random() * rnd.styles.length)];
    this.voice = { name: rnd.name, persona: PERSONA_MAP[rnd.name], id: style.id };
    console.log("[Tsukkomi] voice:", this.voice);
  }

  /** 台詞が出たときにエンジンから呼ぶ（VNEngine.onSpeak で配線） */
  async onLine(speaker: string | null, text: string) {
    if (!this.enabled) return;
    if (!this.includeNarrator && (!speaker || speaker === "narrator")) return;
    if (!text?.trim()) return;

    const now = performance.now();
    if (now - this.lastAt < this.minGapMs) return; // 連発防止
    this.lastAt = now;

    try {
      if (!this.voice) await this.init();
      if (!this.voice) return;

      const prompt =
        `次の発言に対して、短いツッコミを1つだけ返してください。改行や記号は最小限に。\n` +
        `- 口調: ${this.voice.persona}\n- 長さ: 10〜50文字以内\n- NG: 誹謗中傷・下品・暴力表現\n` +
        `【相手の発言】${text}`;

      const reply = await this.askOllama(prompt);
      if (!reply) return;

      // オーバーレイ表示（画像はマップから拾えたら使う）
      if (this.overlay) {
        const img = this.avatarImages?.[this.voice.name];
        this.overlay.show({ name: this.voice.name, text: reply, image: img });
      }

      // 音声合成 → 再生（終了まで待つ）
      const url = await this.voicevoxSynthesize(reply, this.voice.id);
      await this.play(url);

    } catch (e) {
      console.warn("[Tsukkomi] failed:", e);
    } finally {
      // 再生完了後にオーバーレイを隠す
      this.overlay?.hide();
    }
  }

  private async askOllama(prompt: string): Promise<string> {
    const { data } = await this.ol.post("/api/generate", {
      model: this.model,
      prompt,
      stream: false,
    });
    return String(data?.response ?? "").trim();
  }

  private async voicevoxSynthesize(text: string, speakerId: number): Promise<string> {
    const { data: query } = await this.vv.post("/audio_query", null, {
      params: { speaker: speakerId, text },
    });
    const { data } = await this.vv.post<ArrayBuffer>("/synthesis", query, {
      params: { speaker: speakerId },
      responseType: "arraybuffer",
    });
    const blob = new Blob([data], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  }

  /** 再生が完全に終わるまで resolve しない */
  private async play(url: string): Promise<void> {

    const a = new Audio();
    a.autoplay = true;
    a.src = url;
    a.muted = true;
    a.volume = 1;
    (a as any).setAttribute?.("playsinline", "");

    const waitEnded = () =>
      new Promise<void>((resolve) => {
        const finish = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        a.onended = finish;
        a.onerror = finish;
      });

    try {
      await a.play();
      setTimeout(() => (a.muted = false), 0);
    } catch {
      const retry = async () => {
        cleanup();
        try { await a.play(); a.muted = false; } catch { }
      };
      const cleanup = () => {
        window.removeEventListener("pointerdown", retry);
        window.removeEventListener("keydown", retry);
        window.removeEventListener("touchstart", retry);
      };
      window.addEventListener("pointerdown", retry, { once: true });
      window.addEventListener("keydown", retry, { once: true });
      window.addEventListener("touchstart", retry, { once: true });
    }

    await sleep(1000)
    await waitEnded();
  }
}
