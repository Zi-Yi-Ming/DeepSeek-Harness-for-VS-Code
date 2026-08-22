import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";

/**
 * DSH 插件注册表(profile 插件树的读写器)。
 *
 * DSH 的插件树由多层 patch 合成(与服务器 boot 的 compose 顺序一致):
 *   1. bundle 层:profile package.json 的 `dsh.profile.bundles` 数组,每个 bundle
 *      包通过自身 package.json 的 `dsh.bundle.patch` 声明 patch 文件;
 *   2. profile 层:profiles/<name>/cordis.patch.yml(用户配置的 MCP / 插件);
 *   3. home 层:~/.dsh/cordis.patch.yml(可选,对所有 profile 生效);
 *   4. 运行时注入:super-injector 的 registry(~/.dsh/super-injector/registry.json)。
 *
 * 启用/禁用的标准做法(与 DSH 内部 telemetry 开关一致):在 profile 层追加/移除
 * `{ id, disabled: true }` 覆盖条目(按 id 覆盖任意层的行)。改动下次启动生效。
 * 本模块只做文件读写,不依赖 vscode,便于独立测试。
 */

export const DEFAULT_PROFILE = "web";

/** 插件条目来源。 */
export type PluginSource = "profile" | "bundle" | "injected";

/** 插件条目(扁平化后的展示形态)。 */
export interface PluginEntry {
  id: string;
  name: string;
  /** mcp = @deepseek-ai/dsh-mcp-client 实例;plugin = 普通 DSH 插件。 */
  kind: "mcp" | "plugin";
  enabled: boolean;
  /** 覆盖条目是否存在于 patch 文件中(禁用状态的真实来源)。 */
  disabledOverride: boolean;
  source: PluginSource;
  config: Record<string, unknown>;
  /** MCP 实例的展示信息(从 config 提取)。 */
  serverName?: string;
  transport?: string;
  command?: string;
  url?: string;
}

export interface RegistrySnapshot {
  profileDir: string;
  patchPath: string;
  exists: boolean;
  parseError?: string;
  plugins: PluginEntry[];
}

/** DSH 主目录:优先 DSH_HOME 环境变量(测试用),否则 ~/.dsh。 */
export function dshHome(): string {
  const env = process.env.DSH_HOME?.trim();
  if (env) return env;
  return join(homedir(), ".dsh");
}

export function profileDir(profile = DEFAULT_PROFILE): string {
  return join(dshHome(), "profiles", profile);
}

export function patchPath(profile = DEFAULT_PROFILE): string {
  return join(profileDir(profile), "cordis.patch.yml");
}

const MCP_PACKAGE = "@deepseek-ai/dsh-mcp-client";

/** 读取 profile 清单:bundles 列表与依赖声明(读不到返回 undefined)。 */
function profileManifest(profile: string): { bundles: string[] } | undefined {
  const file = join(profileDir(profile), "package.json");
  if (!existsSync(file)) return undefined;
  try {
    const m = JSON.parse(readFileSync(file, "utf8")) as { dsh?: { profile?: { bundles?: unknown } } };
    const bundles = Array.isArray(m.dsh?.profile?.bundles) ? (m.dsh!.profile!.bundles as unknown[]) : [];
    return { bundles: bundles.filter((b): b is string => typeof b === "string") };
  } catch {
    return undefined;
  }
}

/** 解析 profile 的 node_modules 中的 bundle 目录(不可解析的核心 bundle 跳过)。 */
function resolveBundleDir(profile: string, name: string): string | undefined {
  const dir = join(profileDir(profile), "node_modules", ...name.split("/"));
  return existsSync(join(dir, "package.json")) ? dir : undefined;
}

/** 读取一个 bundle 包声明的 patch 文件(未声明/不可读返回 undefined)。 */
function bundlePatchFile(bundleDir: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(bundleDir, "package.json"), "utf8")) as { dsh?: { bundle?: { patch?: unknown } } };
    const rel = pkg.dsh?.bundle?.patch;
    if (typeof rel !== "string") return undefined;
    const file = join(bundleDir, rel);
    return existsSync(file) ? file : undefined;
  } catch {
    return undefined;
  }
}

/** 解析 YAML patch 文件为操作数组(不可解析返回 undefined)。 */
function loadOps(file: string): unknown[] | undefined {
  try {
    const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    if (!raw.trim()) return [];
    const parsed = yaml.load(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return undefined;
  }
}

function rowToEntry(row: Record<string, any>, source: PluginSource): PluginEntry {
  const config = (row.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name : row.id;
  const isMcp = name === MCP_PACKAGE || name.endsWith("/dsh-mcp-client");
  const entry: PluginEntry = {
    id: row.id,
    name,
    kind: isMcp ? "mcp" : "plugin",
    enabled: row.disabled !== true,
    disabledOverride: row.disabled === true,
    source,
    config,
  };
  if (isMcp) {
    if (typeof config.serverName === "string") entry.serverName = config.serverName;
    if (typeof config.transport === "string") entry.transport = config.transport;
    if (typeof config.command === "string") entry.command = config.command;
    if (typeof config.url === "string") entry.url = config.url;
  }
  return entry;
}

/** 注入器注册表条目(运行时注入的超级模组)。 */
interface InjectedEntry {
  name?: string;
  dir?: string;
  injectedAt?: string | number;
}

/** 读取 super-injector 的注入清单(~/.dsh/super-injector/registry.json,不存在返回空)。 */
function readInjected(): InjectedEntry[] {
  const file = join(dshHome(), "super-injector", "registry.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as InjectedEntry[]) : [];
  } catch {
    return [];
  }
}

/** 读取插件树:按合成顺序应用 bundle/profile/home 层,再附加运行时注入条目。 */
export function readRegistry(profile = DEFAULT_PROFILE): RegistrySnapshot {
  const dir = profileDir(profile);
  const file = patchPath(profile);
  const base: RegistrySnapshot = { profileDir: dir, patchPath: file, exists: existsSync(file), plugins: [] };
  // 既没有 patch 也没有 profile 清单:profile 不存在,直接返回空
  if (!base.exists && !existsSync(join(dir, "package.json"))) return base;

  // 按 boot 顺序的 patch 源:bundles(profile node_modules 可解析的)→ profile → home
  const layers: { file: string; source: PluginSource }[] = [];
  const manifest = profileManifest(profile);
  for (const name of manifest?.bundles ?? []) {
    const bundleDir = resolveBundleDir(profile, name);
    const patch = bundleDir ? bundlePatchFile(bundleDir) : undefined;
    if (patch) layers.push({ file: patch, source: "bundle" });
  }
  layers.push({ file, source: "profile" });
  const homePatch = join(dshHome(), "cordis.patch.yml");
  if (existsSync(homePatch)) layers.push({ file: homePatch, source: "profile" });

  // 行表:insert 推入;{ id, disabled } 覆盖行状态;后出现的层覆盖先前的行
  const rows = new Map<string, PluginEntry>();
  let parseError: string | undefined;
  for (const layer of layers) {
    const ops = loadOps(layer.file);
    if (ops === undefined) {
      if (layer.source === "profile") parseError = `cannot parse ${layer.file}`;
      continue;
    }
    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      const o = op as Record<string, any>;
      if (Array.isArray(o.insert)) {
        for (const row of o.insert as unknown[]) {
          if (!row || typeof row !== "object") continue;
          const r = row as Record<string, any>;
          if (typeof r.id !== "string" || !r.id) continue;
          rows.set(r.id, rowToEntry(r, layer.source));
        }
        continue;
      }
      if (typeof o.id === "string" && o.insert === undefined) {
        const target = rows.get(o.id);
        if (!target) continue;
        if (o.disabled === true) {
          target.enabled = false;
          target.disabledOverride = true;
        } else if (o.disabled === false) {
          target.enabled = true;
          target.disabledOverride = false;
        }
      }
    }
  }

  const plugins = [...rows.values()];
  // 运行时注入条目(非合成行,只读展示;source=injected)
  for (const injected of readInjected()) {
    const name = injected.name;
    if (typeof name !== "string" || !name) continue;
    if (plugins.some((p) => p.name === name || p.id === name)) continue;
    const short = name.includes("/") ? name.split("/").pop() ?? name : name;
    plugins.push({
      id: short,
      name,
      kind: name === MCP_PACKAGE || name.endsWith("/dsh-mcp-client") ? "mcp" : "plugin",
      enabled: true,
      disabledOverride: false,
      source: "injected",
      config: {},
    });
  }

  return { ...base, parseError, plugins };
}

export interface ToggleResult {
  ok: boolean;
  error?: string;
  snapshot: RegistrySnapshot;
}

/**
 * 启用/禁用插件:在 profile 的 cordis.patch.yml 追加 `{ id, disabled: true }`
 * 覆盖条目(禁用)或移除该条目(启用)。对任意层(bundle/profile)的行都有效,
 * 因为 profile 层在合成时位于 bundle 层之后。改动在服务器下次启动时生效。
 */
export function togglePlugin(id: string, enabled: boolean, profile = DEFAULT_PROFILE): ToggleResult {
  const file = patchPath(profile);
  const snapshot = readRegistry(profile);
  if (snapshot.parseError) {
    return { ok: false, error: snapshot.parseError, snapshot };
  }
  if (!snapshot.exists) {
    return { ok: false, error: `profile patch not found: ${file}`, snapshot };
  }
  const exists = snapshot.plugins.some((p) => p.id === id);
  if (!exists) {
    return { ok: false, error: `plugin not found in patch: ${id}`, snapshot };
  }
  try {
    const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const ops = (yaml.load(text) as unknown[]) ?? [];
    // 移除该 id 的旧覆盖条目(仅非 insert 的覆盖行),保持其余条目原样
    const kept = ops.filter((op) => {
      if (!op || typeof op !== "object") return true;
      const o = op as Record<string, any>;
      return !(o.insert === undefined && o.id === id);
    });
    if (!enabled) kept.push({ id, disabled: true });
    const header = leadingComments(text);
    writeFileSync(file, header + yaml.dump(kept, { noRefs: true, lineWidth: -1, quotingType: '"' }));
    return { ok: true, snapshot: readRegistry(profile) };
  } catch (error) {
    return { ok: false, error: String(error), snapshot };
  }
}

/** 保留文件开头的注释(含空行),作为重写后的文件头。 */
function leadingComments(text: string): string {
  const lines = text.split("\n");
  let header = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      header += line + "\n";
      continue;
    }
    break;
  }
  return header;
}
