// 智能体启停 ↔ uTools 动态指令同步
//
// 背景：uTools 插件的启动命令（「功能指令」固定命令 + 「匹配指令」正则/划词等）在 plugin.json 的
// features 中静态定义。用户在「设置 → Agent 启停管理」里停用某个智能体时，需要把该智能体对应的
// 启动命令从 uTools 指令注册表中一并移除，否则搜索框仍能搜到并触发。uTools 提供动态指令 API：
//   utools.setFeature(feature) —— 设置/覆盖一个功能（code 可与 plugin.json 静态定义相同，即覆盖）
//   utools.removeFeature(code) —— 从指令注册表移除一个功能（静态/动态统一注册表）
//   utools.getFeatures(codes?) —— 读取当前动态功能
//
// 本模块是「启停状态」与「uTools 指令注册表」之间的唯一同步点，幂等：
//   - 插件装载（onPluginReady）与每次进入（onPluginEnter）时从 uTools DB 读取启停状态重放同步，
//     自愈 uTools 重启 / 插件更新后静态指令回归的场景；
//   - 设置界面勾选变化时由渲染进程调用 syncAgentCommands 即时同步。
// 「通用配置」（commonConfig / installCommonSkill）永远保留，不参与启停。
const fs = require("node:fs");
const path = require("node:path");

// 各智能体 → 其启动命令对应的 feature code（同时覆盖「功能指令」与「匹配指令」）。
// 新增智能体时需同步补充此表；common（通用配置）不在此表，永不启停。
const AGENT_FEATURES = {
  claude: ["claudeConfig", "installClaudeSkill"],
  opencode: ["opencodeConfig", "installOpencodeSkill"],
  pi: ["piConfig", "installPiExtension"],
  omp: ["ompConfig"],
  reasonix: ["reasonixConfig"],
};

const VISIBLE_AGENTS_DB = "ccswitch_visible_agents";

// 读取 plugin.json 静态 features → { code: feature }（规范定义）。
// 注意：本文件经 esbuild bundle 进 preload/services.js 后，__dirname 是 services.js 所在目录
// （dev: public/preload，prod/dist 内: preload），plugin.json 与 preload 同级（上一级）；
// 源码单独 require 时（public/preload/services/）则是上两级。多候选探测兜底。
// 不缓存，始终取最新文件（插件更新后仍能读到新定义）。
function getStaticFeatures() {
  try {
    // 候选 1（prod bundle dist/preload、dev 源码入口 public/preload）：plugin.json 在 preload 上一级
    // 候选 2（dev 源码 services 子目录 public/preload/services）：在 preload 上两级
    const candidates = [
      path.join(__dirname, "..", "plugin.json"),
      path.join(__dirname, "..", "..", "plugin.json"),
    ];
    const pluginJsonPath = candidates.find((p) => fs.existsSync(p));
    if (!pluginJsonPath) return null;
    const data = JSON.parse(
      fs.readFileSync(pluginJsonPath, { encoding: "utf-8" }),
    );
    const map = {};
    (data.features || []).forEach((f) => {
      if (f && f.code) map[f.code] = f;
    });
    return map;
  } catch (e) {
    console.error("[commands] 读取 plugin.json 失败:", e);
    return null;
  }
}

// 归一化启停状态：缺键默认启用（兼容未来新增 agent / 首次运行无记录）
function normalizeVisible(visible) {
  const result = {};
  Object.keys(AGENT_FEATURES).forEach((app) => {
    result[app] = visible ? visible[app] !== false : true;
  });
  return result;
}

// 按启停状态同步 uTools 指令注册表（幂等）：
//   启用 → setFeature(plugin.json 中的规范定义)，保证命令存在且为最新定义
//   停用 → removeFeature(code)，从搜索框移除（固定命令 + 匹配命令一并移除）
function syncAgentCommands(visible) {
  const state = normalizeVisible(visible);
  const features = getStaticFeatures();
  if (!features) {
    return { ok: false, error: "无法读取 plugin.json 的 features" };
  }
  const removed = [];
  const registered = [];
  const failed = [];
  Object.entries(AGENT_FEATURES).forEach(([app, codes]) => {
    const enabled = !!state[app];
    (codes || []).forEach((code) => {
      try {
        if (enabled) {
          const feature = features[code];
          if (!feature) {
            console.warn(`[commands] plugin.json 中缺少 feature code: ${code}`);
            return;
          }
          window.utools.setFeature(feature);
          registered.push(code);
        } else {
          window.utools.removeFeature(code);
          removed.push(code);
        }
      } catch (e) {
        failed.push({ code, error: String((e && e.message) || e) });
        console.error(`[commands] 同步指令失败: ${code}`, e);
      }
    });
  });
  return { ok: failed.length === 0, removed, registered, failed };
}

// 从 uTools DB 读取启停状态并同步（onPluginReady / onPluginEnter 自愈调用）
function initFromDb() {
  try {
    let visible = null;
    try {
      const doc = window.utools.db.get(VISIBLE_AGENTS_DB);
      visible = doc && doc.visible ? doc.visible : null;
    } catch (e) {
      /* ignore */
    }
    return syncAgentCommands(visible);
  } catch (e) {
    console.error("[commands] initFromDb 失败:", e);
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { syncAgentCommands, initFromDb };
