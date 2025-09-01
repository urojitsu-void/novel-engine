import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  const channel = vscode.window.createOutputChannel("VN YAML LSP");
  channel.appendLine("[client] activate");

  // ☆ dist に変更していること
  const serverModule = context.asAbsolutePath(path.join("server", "dist", "server.js"));
  channel.appendLine(`[client] serverModule: ${serverModule}`);

  if (!fs.existsSync(serverModule)) {
    const msg = `[client] server NOT FOUND: ${serverModule}`;
    channel.appendLine(msg);
    vscode.window.showErrorMessage(msg);
    return; // 起動しない
  }

  const serverOptions: ServerOptions = {
    // ☆ TransportKind.ipc に変更
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: "yaml", scheme: "file", pattern: "**/*.vn.yaml" },
      { language: "yaml", scheme: "file", pattern: "**/*.vn.yml" },
    ],
    outputChannel: channel,
    outputChannelName: "VN YAML LSP",
    diagnosticCollectionName: "vn-yaml-lsp",
    revealOutputChannelOn: 3, // Error 時に自動で開く
  };

  client = new LanguageClient("vnYamlLsp", "VN YAML LSP", serverOptions, clientOptions);

  client.start()
    .then(() => channel.appendLine("[client] started"))
    .catch((e) => {
      channel.appendLine(`[client] start FAILED: ${String(e)}`);
      vscode.window.showErrorMessage(`VN YAML LSP start failed: ${String(e)}`);
    });

  context.subscriptions.push({ dispose: () => client?.stop().catch(() => { }) });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
