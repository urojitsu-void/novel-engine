export type CharaPos = "left" | "center" | "right";

export type Character = {
  name: string;
  color?: string;
  chara?: string;
  pos?: CharaPos;
};

export type ActorDirective = {
  show?: boolean;     // true=表示/更新, false=非表示
  pos?: CharaPos;     // 省略時は characters.*.pos または "center"
  chara?: string;     // 省略時は characters.*.chara
};

/** フラグは boolean/number/string を想定（truthy/falsy 判定） */
export type Flags = Record<string, boolean | number | string>;

export type ChoiceItem = {
  text: string;
  goto: string;                 // "block" | "block#label" | "label"
  set?: Flags;                  // 選択時にフラグを複数セット
  require?: string | string[];  // すべて truthy なら表示
  requireNot?: string | string[]; // すべて falsy なら表示
};

export type ControlKeys = {
  bg?: string;
  chara?: string | null;
  narrator?: string;
  sfx?: string;
  bgm?: string;                 // 再生 or "stop"
  wait?: string;                // 今は未使用（将来拡張用）
  label?: string;               // ラベル宣言（次の行から実行）
  goto?: string;                // ジャンプ
  choice?: ChoiceItem[];        // 選択肢
  actors?: Record<string, ActorDirective>;
};

export type LineObject = ControlKeys & Record<string, string>;
export type Line = string | LineObject;



export type StoryBlock = {
  name: string;                 // ブロック名（goto で参照）
  lines: Line[];
};

export type Script = {
  id: string;
  title?: string;
  characters?: Record<string, Character>;
  story: StoryBlock[];          // 複数 lines ブロック
  baseDir: string;
};

export type EngineState = {
  speaker: string;
  bg: string;
};


