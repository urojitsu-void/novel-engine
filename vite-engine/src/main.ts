import { loadScript } from "./scripts/parser";
import { VNEngine } from "./core/loop";
import { TextUI } from "./ui/text";
import { collectAssets, preloadAssets } from "./assets/assets";
import { ChoiceUI } from "./ui/choice";
import { TsukkomiOverlay } from "./ui/tsukkomi";
import { TsukkomiManager } from "./integrations/tsukkomi";

declare const __STORY__: string;

async function main() {
  const script = await loadScript(`/stories/${__STORY__ || 'yakisoba'}/story.vn.yaml`);
  document.title = script.title || 'ノベルゲーム';
  const bgEl = document.getElementById("bg") as HTMLImageElement;
  const charasEl = document.getElementById("charas") as HTMLDivElement;
  const textEl = document.getElementById("text") as HTMLDivElement;
  const nameBoxEl = document.getElementById("namebox") as HTMLDivElement;
  const choicesEl = document.getElementById("choices") as HTMLDivElement
  preloadAssets(collectAssets(script));
  const textUI = new TextUI(textEl, nameBoxEl);
  const choiceUI = new ChoiceUI(choicesEl, { blinkMs: 3000 });
  const engine = new VNEngine(script, textUI, bgEl, charasEl, choiceUI);
  const overlay = new TsukkomiOverlay(document.getElementById("tsukkomi-overlay"));

  // ツッコミを用意（語り手は無視／連発防止1秒／モデル名は必要に応じて）
  const tsukkomi = new TsukkomiManager({
    includeNarrator: false,
    minGapMs: 1000,
    model: "rolandroland/llama3.1-uncensored:latest",
    overlay,
    avatarImages: {
      "四国めたん": "/tsukkomi/metan.png",
      "ずんだもん": "/tsukkomi/zundamon.png",
      "春日部つむぎ": "/tsukkomi/tsumugi.png",
      "ぞん子": "/tsukkomi/zonko.png",
      "九州そら": "/tsukkomi/sora.png",
      "春歌ナナ": "/tsukkomi/nana.png",
      "冥鳴ひまり": "/tsukkomi/himari.png",
      "玄野武宏": "/tsukkomi/takehiro.png",
      "Voidoll": "/tsukkomi/voidoll.png",
    },
  });
  await tsukkomi.init();

  // 台詞ごとに呼ぶ
  engine.onSpeak = async (speaker, text) => {
    if (engine.isAutoplaying) {
      // 例: 選択肢やシステムメッセージを弾きたいならこの辺で条件分岐
      await tsukkomi.onLine(speaker, text);
    }
  };


  let unlocked = false;
  function unlockOnce() {
    if (!unlocked) { unlocked = true; engine.unlockAudio(); }
  }

  document.body.addEventListener("click", () => {
    unlockOnce();
    engine.completeOrNext()
  });
  addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      unlockOnce();
      engine.completeOrNext();
    }
    if (e.key === "a") {
      unlockOnce();
      engine.toggleAutoplay();
    }
  });
  engine.next();
}
void main();
