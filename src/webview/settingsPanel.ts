import * as vscode from "vscode";
import { readFileSync } from "node:fs";
import type { DshHub } from "../dsh/hub";
import { createTranslator, effectiveLanguage } from "../dsh/i18n";
import { readRegistry, togglePlugin, patchPath } from "../dsh/pluginRegistry";
import type { LlmModelGroup, LlmProviderView, SettingsNamespaceView } from "../dsh/types";

/**
 * 设置面板:编辑器区 WebviewPanel(标签页)。包含与 Web 端共用的设置
 * (通用设置 / 模型 / Agent 预设,读写服务器的 settings 文档,双向同步)、
 * DSH 插件(MCP/插件启停)、技能展示与服务器操作。
 */
export class SettingsPanelProvider {
  static readonly viewType = "dsh.settingsPanel";

  private panel: vscode.WebviewPanel | undefined;
  private busy = false;

  /** 通用设置页展示的命名空间(排除内部/复杂配置;模型与预设由专门区块处理)。 */
  private static readonly GENERAL_NS = [
    "ui-theme",
    "ui-conversation",
    "agent-loop",
    "shell",
    "permission",
    "locale",
    "web-search-deepseek",
  ];

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
      case "updateSetting": {
        // 通用设置:settings.update 写服务器的 settings 文档(与 Web 端共用,双向同步)
        if (typeof msg.ns !== "string" || !msg.patch || typeof msg.patch !== "object") break;
        if (this.busy) break;
        this.busy = true;
        try {
          await this.hub.client.settingsUpdate(msg.ns, msg.patch as Record<string, unknown>);
          post({ kind: "notice", message: t("settings.saved"), level: "info" });
          await this.pushState();
        } catch (error) {
          post({ kind: "notice", message: t("settings.saveFailed", { error: String(error) }), level: "error" });
        } finally {
          this.busy = false;
        }
        break;
      }
      case "updateDefaultModel": {
        // 默认模型:写 agent-default-model 命名空间
        const patch: Record<string, unknown> = {};
        if (typeof msg.provider === "string" && msg.provider) patch.provider = msg.provider;
        if (typeof msg.model === "string" && msg.model) patch.model = msg.model;
        if (typeof msg.effort === "string") patch.reasoningEffort = msg.effort;
        if (Object.keys(patch).length === 0) break;
        if (this.busy) break;
        this.busy = true;
        try {
          await this.hub.client.settingsUpdate("agent-default-model", patch);
          post({ kind: "notice", message: t("settings.saved"), level: "info" });
          await this.pushState();
        } catch (error) {
          post({ kind: "notice", message: t("settings.saveFailed", { error: String(error) }), level: "error" });
        } finally {
          this.busy = false;
        }
        break;
      }
      case "updateDefaultPreset": {
        if (typeof msg.id !== "string" || !msg.id) break;
        if (this.busy) break;
        this.busy = true;
        try {
          await this.hub.client.settingsUpdate("agent-presets", { default: msg.id });
          post({ kind: "notice", message: t("settings.saved"), level: "info" });
          await this.pushState();
        } catch (error) {
          post({ kind: "notice", message: t("settings.saveFailed", { error: String(error) }), level: "error" });
        } finally {
          this.busy = false;
        }
        break;
      }
      case "presetAction": {
        // 复制 / 删除 agent 预设(删除需二次确认,由前端两步按钮完成)
        if (typeof msg.id !== "string" || !msg.id) break;
        if (this.busy) break;
        this.busy = true;
        try {
          if (msg.action === "copy") {
            const result = await this.hub.client.copyAgentPreset(msg.id);
            post({ kind: "notice", message: t("settings.presetCopied", { id: result.id ?? "" }), level: "info" });
          } else if (msg.action === "remove") {
            await this.hub.client.removeAgentPreset(msg.id);
            post({ kind: "notice", message: t("settings.presetRemoved"), level: "info" });
          }
          await this.pushState();
        } catch (error) {
          post({ kind: "notice", message: t("settings.saveFailed", { error: String(error) }), level: "error" });
        } finally {
          this.busy = false;
        }
        break;
      }
      case "setCredential": {
        if (typeof msg.ref !== "string" || !msg.ref || typeof msg.value !== "string") break;
        if (this.busy) break;
        this.busy = true;
        try {
          await this.hub.client.credentialsSet(msg.ref, msg.value);
          post({ kind: "notice", message: t("settings.credentialSet", { ref: msg.ref }), level: "info" });
          await this.pushState();
        } catch (error) {
          post({ kind: "notice", message: t("settings.saveFailed", { error: String(error) }), level: "error" });
        } finally {
          this.busy = false;
        }
        break;
      }
      case "unsetCredential": {
        if (typeof msg.ref !== "string" || !msg.ref) break;
        if (this.busy) break;
        this.busy = true;
        try {
          await this.hub.client.credentialsUnset(msg.ref);
          post({ kind: "notice", message: t("settings.credentialUnset", { ref: msg.ref }), level: "info" });
          await this.pushState();
        } catch (error) {
          post({ kind: "notice", message: t("settings.saveFailed", { error: String(error) }), level: "error" });
        } finally {
          this.busy = false;
        }
        break;
      }
      default:
        break;
    }
  }

  /** 推送完整状态:语言 + 通用设置命名空间 + 模型/预设/凭据 + 插件 + 技能 + 服务器。 */
  private async pushState(): Promise<void> {
    if (!this.panel) return;
    const snapshot = readRegistry();
    const serverUp = this.hub.status.serverUp;
    const t = createTranslator();

    let namespaces: SettingsNamespaceView[] = [];
    let llmGroups: LlmModelGroup[] = [];
    let providers: LlmProviderView[] = [];
    let credentials: Record<string, { configured: boolean; writable: boolean; source?: string }> = {};
    let defaultModel: Record<string, unknown> | undefined;
    let defaultPreset: Record<string, unknown> | undefined;
    let presets: { id: string; trust: string; isDefault: boolean; name?: string; description?: string }[] = [];
    let skills: { name: string; description: string; whenToUse?: string; modelInvocable: boolean }[] | null = null;

    if (serverUp) {
      try {
        const describe = await this.hub.client.settingsDescribe();
        const byNs = new Map(describe.namespaces.map((n) => [n.ns, n]));
        namespaces = SettingsPanelProvider.GENERAL_NS.map((ns) => byNs.get(ns)).filter((n): n is SettingsNamespaceView => !!n);
        defaultModel = byNs.get("agent-default-model")?.value;
        defaultPreset = byNs.get("agent-presets")?.value;
      } catch {
        // 忽略:面板仍可显示语言/插件等本地功能
      }
      try {
        const { providers: list } = await this.hub.client.llmProviders();
        providers = list;
      } catch {
        // 忽略
      }
      try {
        const { groups } = await this.hub.client.llmModels();
        llmGroups = groups;
      } catch {
        // 忽略
      }
      try {
        const { presets: list } = await this.hub.client.listAgentPresets();
        presets = list.map((p) => ({ id: p.id, trust: (p as { trust?: string }).trust ?? "system", isDefault: p.isDefault, name: p.name, description: p.description }));
      } catch {
        // 忽略
      }
      try {
        const refs = providers.filter((p) => p.active).map((p) => p.provider);
        if (refs.length > 0) {
          const { credentials: creds } = await this.hub.client.credentialsDescribe(refs);
          credentials = creds;
        }
      } catch {
        // 忽略
      }
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
      namespaces,
      llmGroups,
      providers,
      credentials,
      defaultModel,
      defaultPreset,
      presets,
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
