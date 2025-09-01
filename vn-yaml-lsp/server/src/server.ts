import {
  createConnection, ProposedFeatures, InitializeParams,
  TextDocuments, Diagnostic, DiagnosticSeverity, TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import YAML from "yaml";

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams) => {
  connection.console.log("[server] onInitialize");
  return {
    capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental },
  };
});

function parse(docText: string) {
  try { return YAML.parse(docText); } catch { return null; }
}

function findInLinesSection(text: string, key: string) {
  // lines: の開始を見つける（先頭・インデント込みでOK）
  const m = text.match(/^\s*lines\s*:/m);
  if (!m) return null;
  const linesStart = m.index ?? 0;

  // lines: 以降のテキストに限定して検索（行頭の "- <key>:" を狙う）
  const slice = text.slice(linesStart);

  // YAML のキー名なので、正規表現メタをエスケープ
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(String.raw`^[ \t-]*${esc}[ \t]*:`, "m");

  const m2 = slice.match(re);
  if (!m2 || m2.index == null) return null;

  // マッチ全体の開始位置
  const absStart = linesStart + m2.index;

  // その中で実際のキー名の開始/終了を取る
  const beforeKey = m2[0].match(new RegExp(String.raw`^[ \t-]*`))![0].length;
  const start = absStart + beforeKey;
  const end = start + key.length;

  return { start, end };
}

function validate(doc: TextDocument): Diagnostic[] {
  const text = doc.getText();
  const data = parse(text);
  const diags: Diagnostic[] = [];
  if (!data || typeof data !== "object") return diags;

  // characters を収集
  const chars: Record<string, { name: string }> = {};
  if (data.characters && typeof data.characters === "object") {
    for (const k of Object.keys(data.characters)) {
      const def = data.characters[k];
      if (def && typeof def.name === "string") chars[k] = { name: def.name };
    }
  }

  const lines = Array.isArray(data.lines) ? data.lines : [];
  const control = new Set(["bg", "chara", "narrator", "sfx", "bgm", "wait"]);

  lines.forEach((ln: { [key: string]: unknown }, i: number) => {
    if (ln && typeof ln === "object") {
      for (const k of Object.keys(ln)) {
        if (control.has(k)) continue;
        if (!(k in chars)) {
          // ★ 位置を lines: 節の中から引く
          const pos = findInLinesSection(text, k);
          const range = pos
            ? { start: doc.positionAt(pos.start), end: doc.positionAt(pos.end) }
            : { start: doc.positionAt(0), end: doc.positionAt(0) }; // フォールバック

          diags.push({
            severity: 1, // DiagnosticSeverity.Error
            message: `Unknown character "${k}" at lines[${i}]`,
            source: "vn-yaml-lsp",
            range,
          });
        }
      }
    }
  });

  return diags;
}

documents.onDidChangeContent((c) => {
  const diags = validate(c.document);
  connection.sendDiagnostics({ uri: c.document.uri, diagnostics: diags });
});
documents.onDidOpen((o) => {
  const diags = validate(o.document);
  connection.sendDiagnostics({ uri: o.document.uri, diagnostics: diags });
});

documents.listen(connection);
connection.listen();
