# VN YAML LSP (local VSIX)

最小構成の VSCode 拡張です。`*.vn.yaml` / `*.vn.yml` を開くと、
- `characters` に未定義のキャラ名を `lines` で使ったときに **赤線**

## 使い方（VSIXを作る）
```bash
# 1) 依存をインストール
npm i
npm i -w server

# 2) ビルド
npm run compile  # これは tsconfig の project references で client+server をまとめてビルド

# 3) VSIX パッケージ化（ローカル配布用）
npx vsce package   # → vn-yaml-lsp-0.0.1.vsix が生成される
```
> グローバルに入れたい場合は `npm i -g @vscode/vsce` でもOK

## インストール
VSCode の **Extensions** メニュー → `…` → **Install from VSIX...** から `vn-yaml-lsp-0.0.1.vsix` を選択。

## 開発（F5でデバッグ）
このフォルダを VSCode で開き、**実行とデバッグ** → **Run Extension**。
`client/.vscode/` のタスクで server→client の順にビルドして起動します。
