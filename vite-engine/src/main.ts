import { loadScript } from "./script/parser";
import { VNEngine } from "./core/loop";
import { TextUI } from "./ui/text";
import { collectAssets, preloadAssets } from "./assets/assets";
import { ChoiceUI } from "./ui/choice";

declare const __STORY__: string;

async function main() {
  const script = await loadScript(`/stories/${__STORY__ || 'demo'}/story.vn.yaml`);
  document.title = script.title || 'ノベルゲーム';
  const bgEl = document.getElementById("bg") as HTMLImageElement;
  const charasEl = document.getElementById("charas") as HTMLDivElement;
  const textEl = document.getElementById("text") as HTMLDivElement;
  const nameBoxEl = document.getElementById("namebox") as HTMLDivElement;
  const choicesEl = document.getElementById("choices") as HTMLDivElement
  preloadAssets(collectAssets(script));
  const textUI = new TextUI(textEl, nameBoxEl);
  const choiceUI = new ChoiceUI(choicesEl);
  const engine = new VNEngine(script, textUI, bgEl, charasEl, choiceUI);

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
