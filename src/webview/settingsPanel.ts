import * as vscode from "vscode";
import { readFileSync } from "node:fs";
import type { DshHub } from "../dsh/hub";
import { createTranslator, effectiveLanguage } from "../dsh/i18n";
import { readRegistry, togglePlugin, patchPath } from "../dsh/pluginRegistry";

/**
 * 设置面板:编辑器区 WebviewPanel(标签页),管理界面语言与 DSH 插件
 * (MCP 服务 / 普通插件的启用禁用)、展示技能,并提供服务器重启入口。
 * 插件配置读写 profile 的 cordis.patch.yml(与 DSH 服务器同机),改动在
 * 服务器下次启动时生效。
 */
export class SettingsPanelProvider {
  static readonly viewType = "dsh.settingsPanel";

  private panel: vscode.WebviewPanel | undefined;
  private busy = false;

  constructor(
    private readonly hub: DshHub,
    private readonly ctx: vscode.ExtensionContext,
  ) {}

  /** 打开设置面板(已打开则聚焦);服务器离线也能打开(插件区仍可操作文件)。 */
  async open(): Promise<vscode.WebviewPanel | undefined> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      return this.panel;
    }
    const t = createTranslator();
    const panel = vscode.window.createWebviewPanel(
      SettingsPanelProvider.viewType,
      t("settings.panelTitle"),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.ctx.extensionUri, "dist"),
          vscode.Uri.joinPath(this.ctx.extensionUri, "media"),
        ],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, "media", "icon.svg");
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel = panel;
    return panel;
  }

  private async onMessage(msg: { kind: string; [key: string]: any }): Promise<void> {
    const t = createTranslator();
    const post = (message: unknown) => {
      if (this.panel) void this.panel.webview.postMessage(message);
    };
    switch (msg.kind) {
      case "ready":
        await this.pushState();
        break;
      case "setLanguage": {
        const lang = msg.lang === "zh-cn" || msg.lang === "en" ? msg.lang : "auto";
        try {
          await vscode.workspace.getConfiguration("dsh").update("language", lang, vscode.ConfigurationTarget.Global);
          // 聊天通道已监听 dsh.language 变更并自动切换;这里仅确认设置面板自身
          post({ kind: "languageApplied", language: lang });
          post({ kind: "notice", message: t("settings.languageApplied"), level: "info" });
        } catch (error) {
          post({ kind: "notice", message: t("settings.toggleFailed", { error: String(error) }), level: "error" });
        }
        break;
      }
      case "togglePlugin": {
        if (typeof msg.id !== "string" || typeof msg.enabled !== "boolean") break;
        if (this.busy) break;
        this.busy = true;
        try {
          const result = togglePlugin(msg.id, msg.enabled);
          if (!result.ok) {
            post({ kind: "notice", message: t("settings.toggleFailed", { error: result.error ?? "" }), level: "error" });
          } else {
            await this.pushState();
            post({ kind: "notice", message: t("settings.changed"), level: "info" });
          }
        } finally {
          this.busy = false;
        }
        break;
      }
      case "restartServer": {
        const status = this.hub.status;
        if (!status.serverUp || status.serverStarting) {
          post({ kind: "notice", message: t("settings.serverOffline"), level: "error" });
          break;
        }
        try {
          const stopped = await this.hub.server.stop();
          if (!stopped.ok) {
            // 服务器不是本扩展启动的(或停止失败),无法代为重启
            post({ kind: "notice", message: stopped.message ?? t("settings.manualRestart"), level: "info" });
            break;
          }
          const ready = await this.hub.ensureReady();
          post({
            kind: "notice",
            message: ready.ok ? t("settings.restartDone") : t("settings.restartFailed", { error: ready.message ?? "" }),
            level: ready.ok ? "info" : "error",
          });
        } catch (error) {
          post({ kind: "notice", message: t("settings.restartFailed", { error: String(error) }), level: "error" });
        }
        await this.pushState();
        break;
      }
      case "openPatch": {
        const file = patchPath();
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
          await vscode.window.showTextDocument(doc, { preview: false });
        } catch (error) {
          post({ kind: "notice", message: t("settings.openPatchFailed", { error: String(error) }), level: "error" });
        }
        break;
      }
      default:
        break;
    }
  }

  /** 推送完整状态:语言 + 插件注册表 + 技能 + 服务器状态。 */
  private async pushState(): Promise<void> {
    if (!this.panel) return;
    const snapshot = readRegistry();
    let skills: { name: string; description: string; whenToUse?: string; modelInvocable: boolean }[] | null = null;
    const serverUp = this.hub.status.serverUp;
    if (serverUp) {
      // 技能按会话读取:先刷新会话列表,再取当前/最近会话兜底
      try {
        await this.hub.refreshSessions();
        let sid = this.hub.store.currentSessionId;
        if (!sid) sid = this.hub.store.listSessions()[0]?.sessionId;
        if (sid) {
          const value = await this.hub.getSkills(sid);
          skills = value?.skills ?? [];
        }
      } catch {
        skills = null;
      }
    }
    void this.panel.webview.postMessage({
      kind: "state",
      lang: effectiveLanguage(),
      language: vscode.workspace.getConfiguration("dsh").get<string>("language", "auto"),
      serverUp,
      version: this.hub.status.version,
      parseError: snapshot.parseError,
      plugins: snapshot.plugins,
      skills,
    });
  }

  private cssCache: string | undefined;
  private css(): string {
    if (this.cssCache === undefined) {
      try {
        this.cssCache = readFileSync(vscode.Uri.joinPath(this.ctx.extensionUri, "media", "settings.css").fsPath, "utf8");
      } catch {
        this.cssCache = "";
      }
    }
    return this.cssCache;
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, "dist", "webview", "settings.js"));
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
      "img-src data:",
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
${this.css()}
  </style>
  <title>DSH Settings</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
