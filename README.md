# VN Script YAML 仕様（README）

短編ノベルゲーム用の **YAML スクリプト形式**を定義します。  

---

## クイックスタート（最小の完成例）

```yaml
id: short-story
title: 港町の夜

characters:
  Akito: { name: "暁翔", color: "#4af", chara: ./akito.png, pos: center }
  Yuina: { name: "結菜", color: "#f8c", chara: ./yuina.png, pos: center }

story:
  - name: main
    lines:
      - bgm: ./bgm.mp3
      - bg: ./bg_port.png
      - narrator: "港町の夜。波の音が静かに耳をくすぐる。"
      - actors:
          { Akito: { pos: left, show: true }, Yuina: { pos: right, show: true } }
      - choice:
          - text: "困っている結菜を助ける"
            goto: port
            set: { kindness: 1 }
          - text: "様子を見るだけにする"
            goto: port
            set: { kindness: 0 }

  - name: port
    lines:
      - Akito: "よお、遅かったな。"
      - narrator: "どう声をかける？"
      - choice:
          - text: "正直に助けたことを伝える"
            goto: niceTalk
            require: kindness
          - text: "話題を逸らす"
            goto: smallTalk
          - text: "からかってみる"
            goto: tease
            requireNot: kindness

  - name: niceTalk
    lines:
      - Yuina: "…ありがとう。さっき助けてくれて、本当に心強かった。"
      - narrator: "ふたりの間に、柔らかな空気が流れた。"
      - goto: lighthouse

  - name: smallTalk
    lines:
      - Akito: "まあ…とりあえず灯台の方へ行くか。"
      - Yuina: "うん、賛成。"
      - goto: lighthouse

  - name: tease
    lines:
      - Akito: "迷子の子猫ちゃん、送ってあげようか？"
      - Yuina: "…からかわないで。行こ。"
      - goto: lighthouse

  - name: lighthouse
    lines:
      - bg: ./bg_lighthouse.png
      - actors: { Akito: { pos: right }, Yuina: { pos: left } }
      - Yuina: "灯台の光って、不思議と心が落ち着くね。"
      - goto: end

  - name: end
    lines:
      - bgm: stop
      - sfx: ./sfx.mp3
      - narrator: "[END]"
```

---

## 1. ファイルとパス

- この YAML は **1 本の物語** を表します。
- 画像・音声などの **相対パスは「YAML ファイルの保存場所」基準** で解決されます。  
  例：`stories/demo/story.vn.yaml` から `./bg.png` → `stories/demo/bg.png`

> すべてのアセット（画像・音声）は YAML のあるディレクトリを起点に解決されます。

---

## 2. トップレベル

| キー           | 型                              | 必須 | 説明 |
|----------------|---------------------------------|------|------|
| `id`           | `string`                        | ✅   | 物語の識別子（ユニーク推奨） |
| `title`        | `string`                        | ❌   | 物語のタイトル |
| `characters`   | `Record<string, Character>`     | ❌   | 登場人物の定義（キーが話者IDになる） |
| `story`        | `StoryBlock[]`                  | ✅   | ストーリー本体（複数ブロックの配列） |

**Character 例**

```yaml
characters:
  Akito:
    name: "暁翔"        # 表示名
    color: "#4af"       # 任意（名前色など）
    chara: ./akito.png  # 立ち絵のデフォルト画像
    pos: center         # デフォルト位置: left / center / right
```

---

## 3. ストーリーブロック

```yaml
story:
  - name: main
    lines:
      - …
```

- 実行開始ブロックは、`name: main` があれば `main`、なければ **配列の先頭** です。
- 各ブロックは `lines`（行の配列）で構成されます。

---

## 4. 行（Line）の種類

### 4.1 テキスト行（表示して停止）

- **地の文**：`narrator: "…"`  
- **台詞**：キャラIDをキーに `"…"`  
- **省略形**：プレーン文字列（`- "…"`）は「**直前の話者**」の続き（開始時は `narrator`）

```yaml
- narrator: "海風が冷たい。"
- Akito: "よお。"
- "……遅かったな。"
```

### 4.2 制御行（基本は継続。明記がない限り停止しません）

| キー       | 型                               | 例                                     | 挙動 |
|-----------|----------------------------------|----------------------------------------|------|
| `bg`      | `string`                         | `bg: ./bg_port.png`                    | 背景画像を差し替える |
| `bgm`     | `string` \| `"stop"`             | `bgm: ./bgm.mp3` / `bgm: stop`         | BGM 再生（ループ）/ 停止 |
| `sfx`     | `string`                         | `sfx: ./sfx.mp3`                       | 効果音ワンショット |
| `wait`    | `string`                         | `wait: "500ms"` / `"0.5s"` / `"500"`   | 指定時間待機して自動で次へ |
| `label`   | `string`                         | `label: afterTalk`                     | ジャンプ先ラベルを**次行位置**に付与 |
| `goto`    | `string`                         | `goto: block` / `label` / `block#label`| 指定場所へジャンプ |
| `choice`  | `ChoiceItem[]`                   | 下記参照                                | 選択肢を表示（**ここで停止**） |
| `actors`  | `Record<string, ActorDirective>` | 下記参照                                | 複数キャラの表示・位置・画像変更（停止しない） |

> メモ：`actors` は画面状態を更新しますが **停止しません**。  
> `choice` は選択 UI を出し、選択されるまで **停止** します。

---

## 5. 選択肢（choice）

**基本形**

```yaml
- narrator: "どうする？"
- choice:
    - text: "助ける"
      goto: after
      set: { kindness: 1 }     # フラグを保存（後続で参照可能）
    - text: "見ているだけ"
      goto: after
      set: { kindness: 0 }
```

**条件付き表示**

```yaml
- choice:
    - text: "礼を伝える"
      goto: nice
      require: kindness            # truthy のときだけ表示
    - text: "からかう"
      goto: tease
      requireNot: kindness         # falsy のときだけ表示
```

**`ChoiceItem` のフィールド**

| フィールド   | 型                                     | 説明 |
|--------------|----------------------------------------|------|
| `text`       | `string`                               | ボタンに表示する文言 |
| `goto`       | `string`                               | 遷移先（`block` / `label` / `block#label`） |
| `set`        | `Record<string, boolean \| number \| string>` | 選択時に設定するフラグ |
| `require`    | `string \| string[]`                   | 条件（**すべて**が truthy のときに表示） |
| `requireNot` | `string \| string[]`                   | 条件（**すべて**が falsy のときに表示） |

---

## 6. ジャンプ（goto / label）

- `label: foo` で **次行位置** にラベル `foo` を付与します。
- `goto` の指定は 3 形：
  - `goto: blockName` … ブロックの先頭へ
  - `goto: labelName` … **同一ブロック内** のラベルへ
  - `goto: blockName#labelName` … 指定ブロック内のラベルへ

---

## 7. 複数キャラ表示（actors）

**目的**：キャラの「出す/消す」「位置」「画像差し替え」を 1 行で複数人まとめて更新。

```yaml
# 2人を表示して左右に配置
- actors:
    Akito: { pos: left,  show: true }
    Yuina: { pos: right, show: true }

# 会話途中で配置を入れ替え
- actors: { Akito: { pos: right }, Yuina: { pos: left } }

# 表情差分など画像差し替え
- actors: { Akito: { chara: ./akito_smile.png } }

# 一時退場
- actors: { Yuina: { show: false } }
```

**`ActorDirective` のフィールド**

| フィールド | 型                               | 説明 |
|------------|----------------------------------|------|
| `show`     | `true / false`                   | 表示 / 非表示 |
| `pos`      | `"left" \| "center" \| "right"` | 配置位置 |
| `chara`    | `string`                         | この行での画像差し替え（未指定ならキャラ定義の `chara` を使用） |

> `show / pos / chara` は **同時指定** で一括更新できます。  
> 例）`{ Akito: { show: true, chara: ./akito_smile.png, pos: right } }`

---

## 8. 背景と音

```yaml
- bg: ./bg_port.png
- bgm: ./bgm.mp3      # ループ再生
- sfx: ./sfx.mp3      # ワンショット
- bgm: stop           # 停止
```

> ブラウザの自動再生ポリシーにより、初回再生にユーザー操作が必要な場合があります。

---

## 9. 待機（wait）

```yaml
- wait: "500"     # 500ms
- wait: "500ms"
- wait: "0.5s"
```

指定時間の経過後に自動で次の行へ進みます。

---

## 10. スニペット集

**分岐 → 合流**

```yaml
- choice:
    - text: "Aへ"  goto: A
    - text: "Bへ"  goto: B

# …A/B それぞれの展開…

- goto: common

- label: common
- narrator: "そして——"
```

**条件付きで隠し選択肢**

```yaml
- choice:
    - text: "普通の選択"
      goto: next
    - text: "隠し選択（親密度が高いと出現）"
      goto: secret
      require: intimacy
```

---

## 11. ベストプラクティス

- **1 吹き出し = 1 行** を意識してテンポよく。
- **ラベル名は簡潔に**（例：`afterChoice`, `rejoin`）。
- **フラグ名は意味を持たせる**（例：`kindness`, `helpedYuina`）。
- 画像差分は命名で整理（例：`akito_smile.png`, `yuina_angry.png`）。

---

## 12. よくあるエラー

- **未定義キャラIDを話者に使用** → その行は正しく表示されません。  
- **`goto` の解決先が存在しない** → 進行が止まります。ブロック名・ラベル名を再確認してください。  
- **相対パスの基準を誤る** → アセットが読み込まれません。常に「YAML ファイルの場所」基準です。
