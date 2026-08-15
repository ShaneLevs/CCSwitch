const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { execSync, spawn } = require("node:child_process");
const usage = require("./usage");

const PI_DIR = () => path.join(require("os").homedir(), ".pi", "agent");
const PI_SETTINGS_PATH = () => path.join(PI_DIR(), "settings.json");
const PI_MODELS_PATH = () => path.join(PI_DIR(), "models.json");
const PI_SESSIONS_DIR = () => path.join(PI_DIR(), "sessions");
const PI_NPM_DIR = () => path.join(PI_DIR(), "npm", "node_modules");
const PI_CMD_TIMEOUT = { list: 15_000, install: 120_000, default: 30_000 };

// ==================== 路径发现 ====================

const resolvePiPath = () => {
  const candidates = [
    path.join(require("os").homedir(), ".local", "bin", "pi"),
    path.join(require("os").homedir(), ".npm-global", "bin", "pi"),
    path.join(require("os").homedir(), ".bun", "bin", "pi"),
    path.join(
      require("os").homedir(),
      ".bun",
      "install",
      "global",
      "bin",
      "pi",
    ),
    "/usr/local/bin/pi",
    "/usr/bin/pi",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  try {
    const which = execSync("where pi 2>nul", {
      encoding: "utf-8",
      timeout: 5000,
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const w of which) {
      // 优先用 .cmd — 自带 node.exe 查找逻辑
      if (w.toLowerCase().endsWith(".cmd")) return w;
    }
    // .ps1 → 转换为 node.exe + cli.js 直调
    for (const w of which) {
      if (w.toLowerCase().endsWith(".ps1")) {
        const basedir = path.dirname(w);
        const cliPath = path.join(
          basedir,
          "node_modules",
          "@earendil-works",
          "pi-coding-agent",
          "dist",
          "cli.js",
        );
        if (!fs.existsSync(cliPath)) continue;
        const localNode = path.join(basedir, "node.exe");
        if (fs.existsSync(localNode)) return `${localNode}|${cliPath}`;
        try {
          const pathNode = execSync("where node 2>nul", {
            encoding: "utf-8",
            timeout: 5000,
          })
            .trim()
            .split("\n")[0];
          if (pathNode && fs.existsSync(pathNode))
            return `${pathNode}|${cliPath}`;
        } catch {
          /* ignore */
        }
      }
    }
    // 没扩展名的 pi（shell script）→ 直接用，cmd.exe 会通过 PATHEXT 解析
    if (which.length > 0) return which[0];
  } catch {
    /* ignore */
  }
  return "pi";
};

const readJson = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, { encoding: "utf-8" }));
  } catch {
    return null;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
  });
};

const runPiCmd = (args, timeout) =>
  new Promise((resolve) => {
    const piBin = resolvePiPath();
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const ms = timeout || PI_CMD_TIMEOUT.default;

    let command, spawnArgs;
    if (piBin.includes("|")) {
      const [nodeExe, cliPath] = piBin.split("|");
      command = nodeExe;
      spawnArgs = [cliPath, ...args];
    } else {
      command = piBin;
      spawnArgs = args;
    }

    const child = spawn(command, spawnArgs, {
      env,
      shell: true,
      windowsHide: true,
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        stdout: stdout.trim(),
        stderr: `timeout after ${ms}ms`,
      });
    }, ms);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0)
        resolve({
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      else
        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim() || `exit code ${code}`,
        });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, stdout: stdout.trim(), stderr: err.message });
    });
  });

// ==================== Settings ====================

const readPiSettings = () => readJson(PI_SETTINGS_PATH()) || {};
const writePiSettings = (data) => writeJson(PI_SETTINGS_PATH(), data);

// ==================== Models / Providers ====================

const readPiModels = () => readJson(PI_MODELS_PATH()) || { providers: {} };
const writePiModels = (data) => writeJson(PI_MODELS_PATH(), data);

// ==================== 自动获取模型列表 ====================

// GET {baseUrl}/models —— OpenAI-compatible 接口
// 容错策略：部分中转站（New API / one-api）根路径 /models 返回面板 HTML，
// 真实 OpenAI 兼容端点在 /v1/models；baseUrl 已含 /v1 前缀时直接在其后拼接。
// 依次尝试候选路径，直到拿到合法 JSON 模型列表。
const fetchProviderModels = async (baseUrl, apiKey, timeout = 10_000) => {
  const base = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
  const root = base.endsWith("/") ? base : base + "/";

  const pathname = new URL(root).pathname;
  const hasV1Prefix = /\/v1\/?$/.test(pathname);
  const candidates = hasV1Prefix ? ["models"] : ["models", "v1/models"];

  const tryOnce = (p) =>
    new Promise((resolve, reject) => {
      // 相对拼接，保留 baseUrl 自身路径（如 /v1 或代理前缀）
      const url = new URL(p, root);
      const mod = url.protocol === "https:" ? https : http;
      const req = mod.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          headers: {
            accept: "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          timeout,
        },
        (res) => {
          // 重定向：跟随（location 为绝对地址时重新解析）
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            return resolve(
              fetchProviderModels(res.headers.location, apiKey, timeout),
            );
          }
          // 非 2xx，或 content-type 明确不是 JSON（如中转站面板 HTML）→ 换下一个候选路径
          const ct = (res.headers["content-type"] || "").toLowerCase();
          if (
            res.statusCode < 200 ||
            res.statusCode >= 300 ||
            (ct && !ct.includes("json"))
          ) {
            res.resume();
            return reject(
              new Error(
                `HTTP ${res.statusCode}${ct ? ` (${ct.split(";")[0]})` : ""}`,
              ),
            );
          }
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              const list = parsed.data || parsed.models || parsed;
              if (!Array.isArray(list))
                return reject(new Error("响应格式错误"));
              resolve(
                list
                  .map((m) => {
                    const item = typeof m === "string" ? { id: m } : m || {};
                    const id = item.id || item.name;
                    if (!id) return null;
                    return {
                      id,
                      name: item.name || item.id || id,
                      contextWindow:
                        item.context_window ||
                        item.context_length ||
                        item.contextWindow ||
                        item.max_context_length ||
                        0,
                      maxTokens: item.max_tokens || item.maxTokens || 0,
                      reasoning: !!(
                        item.capabilities ||
                        item.architecture?.modality ||
                        ""
                      )
                        .toString()
                        .includes("reasoning"),
                    };
                  })
                  .filter(Boolean),
              );
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout"));
      });
    });

  let lastErr = null;
  for (const p of candidates) {
    try {
      return await tryOnce(p);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("获取模型列表失败");
};

const getPiProviderList = () => {
  const models = readPiModels();
  const settings = readPiSettings();
  return Object.entries(models.providers || {}).map(([name, cfg]) => ({
    name,
    apiKey: cfg.apiKey || "",
    baseUrl: cfg.baseUrl || "",
    api: cfg.api || "",
    headers: cfg.headers || {},
    authHeader: !!cfg.authHeader,
    models: (cfg.models || []).map((m) => ({
      id: m.id,
      name: m.name || m.id,
      contextWindow: m.contextWindow || undefined,
      maxTokens: m.maxTokens || undefined,
      reasoning: !!m.reasoning,
      isDefault: settings.defaultModel === m.id,
      input: m.input || ["text"],
      cost: m.cost && m.cost.input != null ? m.cost : null,
      compat: m.compat || {},
    })),
    isDefault: settings.defaultProvider === name,
  }));
};

const setPiDefaultProvider = (providerName) => {
  const settings = readPiSettings();
  settings.defaultProvider = providerName;
  // 如果当前 defaultModel 不属于新供应商，自动切到该供应商第一个模型
  const models = readPiModels();
  const prov = models.providers?.[providerName];
  if (prov?.models?.length) {
    const stillValid = prov.models.some((m) => m.id === settings.defaultModel);
    if (!stillValid) {
      settings.defaultModel = prov.models[0].id;
    }
  }
  writePiSettings(settings);
};

const setPiDefaultModel = (modelId) => {
  const settings = readPiSettings();
  settings.defaultModel = modelId;
  writePiSettings(settings);
};

// cost 规范化：全为 0 时返回 undefined（配置文件中不写 cost，Pi schema 约定 0 无效）
const normalizeCost = (cost) => {
  if (!cost || typeof cost !== "object") return undefined;
  const c = {
    input: Number(cost.input) || 0,
    output: Number(cost.output) || 0,
    cacheRead: Number(cost.cacheRead) || 0,
    cacheWrite: Number(cost.cacheWrite) || 0,
  };
  if (!c.input && !c.output && !c.cacheRead && !c.cacheWrite) return undefined;
  return c;
};

const updatePiModel = (providerName, modelId, updates) => {
  const models = readPiModels();
  if (!models.providers?.[providerName])
    throw new Error(`供应商 ${providerName} 不存在`);
  const prov = models.providers[providerName];
  if (!prov.models) return;
  const idx = prov.models.findIndex((m) => m.id === modelId);
  if (idx === -1) throw new Error(`模型 ${modelId} 不存在`);
  // 不允许通过编辑改 id（id 是唯一标识）
  const next = { ...prov.models[idx] };
  if (updates.name !== undefined) next.name = updates.name;
  if (updates.contextWindow !== undefined)
    next.contextWindow = updates.contextWindow || undefined;
  if (updates.maxTokens !== undefined)
    next.maxTokens = updates.maxTokens || undefined;
  if (updates.reasoning !== undefined) next.reasoning = !!updates.reasoning;
  if (updates.input !== undefined) next.input = updates.input;
  if (updates.cost !== undefined) {
    const cost = normalizeCost(updates.cost);
    if (cost) next.cost = cost;
    else delete next.cost;
  }
  if (updates.compat !== undefined) next.compat = updates.compat;
  prov.models[idx] = next;
  writePiModels(models);
};

const updatePiProvider = (providerName, updates) => {
  const models = readPiModels();
  if (!models.providers) models.providers = {};
  if (!models.providers[providerName])
    models.providers[providerName] = { models: [] };
  Object.assign(models.providers[providerName], updates);
  writePiModels(models);
};

const addPiProvider = (providerName, cfg = {}) => {
  if (!providerName || typeof providerName !== "string")
    throw new Error("供应商名不能为空");
  const models = readPiModels();
  if (!models.providers) models.providers = {};
  if (models.providers[providerName])
    throw new Error(`供应商 ${providerName} 已存在`);
  models.providers[providerName] = {
    apiKey: cfg.apiKey || "",
    baseUrl: cfg.baseUrl || "",
    api: cfg.api || "openai-completions",
    headers: cfg.headers || {},
    authHeader: !!cfg.authHeader,
    models: [],
  };
  writePiModels(models);
};

const deletePiProvider = (providerName) => {
  const models = readPiModels();
  if (!models.providers?.[providerName]) throw new Error("供应商不存在");
  delete models.providers[providerName];
  writePiModels(models);
  // 清理 settings 中的 defaultProvider 指向
  const settings = readPiSettings();
  if (settings.defaultProvider === providerName) {
    settings.defaultProvider = "";
    writePiSettings(settings);
  }
};

const addPiModel = (providerName, model) => {
  if (!providerName) throw new Error("供应商名不能为空");
  if (!model?.id) throw new Error("模型 ID 不能为空");
  const models = readPiModels();
  if (!models.providers?.[providerName])
    throw new Error(`供应商 ${providerName} 不存在`);
  const prov = models.providers[providerName];
  if (!prov.models) prov.models = [];
  if (prov.models.some((m) => m.id === model.id))
    throw new Error(`模型 ${model.id} 已存在`);
  const cost = normalizeCost(model.cost);
  prov.models.push({
    id: model.id,
    name: model.name || model.id,
    contextWindow: model.contextWindow || undefined,
    maxTokens: model.maxTokens || undefined,
    reasoning: !!model.reasoning,
    input: model.input || ["text"],
    ...(cost ? { cost } : {}),
    compat: model.compat || {},
  });
  writePiModels(models);
};

const deletePiModel = (providerName, modelId) => {
  const models = readPiModels();
  if (!models.providers?.[providerName])
    throw new Error(`供应商 ${providerName} 不存在`);
  const prov = models.providers[providerName];
  if (!prov.models) return;
  prov.models = prov.models.filter((m) => m.id !== modelId);
  writePiModels(models);
  // 清理 defaultModel 指向
  const settings = readPiSettings();
  if (settings.defaultModel === modelId) {
    settings.defaultModel = "";
    writePiSettings(settings);
  }
};

// ==================== Extensions (Packages) ====================

// pi.dev 包市场：拉取 /packages 并解析 SSR HTML
// 说明：pi.dev 无 JSON API，包列表为 SSR HTML；搜索/类型/排序/分页均为 GET 整页导航，
// 接口即 https://pi.dev/packages?sort=&name=&type=&page= ，可直接离线重放（不依赖浏览器）
const fetchPiDevPackages = (params = {}, redirects = 0) => {
  const { page = 1, name = "", type = "", sort = "downloads" } = params;
  const qs = [];
  if (sort && sort !== "downloads") qs.push("sort=" + encodeURIComponent(sort));
  if (name) qs.push("name=" + encodeURIComponent(name));
  if (type) qs.push("type=" + encodeURIComponent(type));
  if (page && Number(page) > 1)
    qs.push("page=" + encodeURIComponent(String(page)));
  const url = "https://pi.dev/packages" + (qs.length ? "?" + qs.join("&") : "");

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          accept: "text/html",
        },
        timeout: 15_000,
      },
      (res) => {
        // pi.dev 会对参数顺序做 302 规范化，跟随重定向（最多 3 次）
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 3) return reject(new Error("too many redirects"));
          const loc = res.headers.location;
          const next = loc.indexOf("://") >= 0 ? loc : "https://pi.dev" + loc;
          const nextParams = {};
          const qi = next.indexOf("?");
          if (qi >= 0) {
            for (const kv of next.slice(qi + 1).split("&")) {
              const eq = kv.indexOf("=");
              if (eq > 0)
                nextParams[decodeURIComponent(kv.slice(0, eq))] =
                  decodeURIComponent(kv.slice(eq + 1));
            }
          }
          return resolve(fetchPiDevPackages(nextParams, redirects + 1));
        }
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          try {
            resolve(parsePiDevPackagesHtml(data));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", function () {
      this.destroy();
      reject(new Error("timeout"));
    });
  });
};

const parsePiDevPackagesHtml = (html) => {
  let total = 0;
  const t = html.match(/packages-count">[^<]*\/\s*(\d+)/);
  if (t) total = parseInt(t[1], 10);

  let lastPage = 0;
  const pageLinks = [...html.matchAll(/href="\/packages[^"]*page=(\d+)"/g)];
  for (const pl of pageLinks)
    lastPage = Math.max(lastPage, parseInt(pl[1], 10));

  const items = [];
  const re =
    /<article class="surface-panel content-card"[^>]*data-package-card="true"([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const b = m[1];
    const name = (b.match(/data-package-name="([^"]*)"/) || [])[1] || "";
    if (!name) continue;
    const types = [
      ...b.matchAll(/class="meta-chip packages-badge" data-type="([^"]*)"/g),
    ].map((x) => x[1]);
    const downloads = parseInt(
      (b.match(/data-package-downloads="(\d+)"/) || [])[1] || "0",
      10,
    );
    const date = parseInt(
      (b.match(/data-package-date="(\d+)"/) || [])[1] || "0",
      10,
    );
    const desc = (
      (b.match(/class="packages-desc">([\s\S]*?)<\/p>/) || [])[1] || ""
    )
      .replace(/<[^>]+>/g, "")
      .trim();
    const metaMatch = b.match(/class="packages-meta">([\s\S]*?)<\/div>/);
    const metaSpans = metaMatch
      ? [...metaMatch[1].matchAll(/<span>([^<]*)<\/span>/g)].map((x) => x[1])
      : [];
    const links = [
      ...b.matchAll(
        /<a href="(https?:\/\/[^"]*)" target="_blank" rel="noopener">/g,
      ),
    ].map((x) => x[1]);
    items.push({
      name,
      types,
      downloads,
      date,
      description: desc,
      author: metaSpans[0] || "",
      downloadsText: metaSpans[1] || "",
      dateText: metaSpans[2] || "",
      npm: links[0] || "",
      repo: links[1] || "",
    });
  }
  return { items, total, lastPage, pageSize: 50 };
};

const getPiExtensions = () => {
  const settings = readPiSettings();
  const packages = settings.packages || [];
  return packages
    .map((entry) => {
      // pi 新版 packages 条目可能是对象（{ source, extensions: ['+index.ts'] }，含扩展启停状态），兼容纯字符串旧格式
      const src =
        typeof entry === "string" ? entry : (entry && entry.source) || "";
      if (!src) return null;
      const pkgDir = path.join(
        PI_NPM_DIR(),
        ...src.replace("npm:", "").split("/"),
      );
      const name = src.replace("npm:", "");
      let version = "",
        description = "";
      try {
        const pkg = readJson(path.join(pkgDir, "package.json"));
        if (pkg) {
          version = pkg.version || "";
          description = pkg.description || "";
        }
      } catch {
        /* ignore */
      }

      // pi config resource introspection
      const resources = { extensions: [], skills: [], mcpServers: [] };

      // 扩展列表：优先用 pi 自身记录的清单（带 +/− 启停前缀）；其次 package.json 的 pi.extensions 字段；最后扫常见目录
      const rawExts =
        typeof entry === "object" && Array.isArray(entry.extensions)
          ? entry.extensions
          : null;
      if (rawExts) {
        resources.extensions = rawExts
          .map((e) => String(e).replace(/^[+-]/, ""))
          .filter(Boolean);
      } else {
        const declared = readJson(path.join(pkgDir, "package.json"))?.pi
          ?.extensions;
        if (Array.isArray(declared) && declared.length) {
          resources.extensions = declared
            .map((e) => String(e).replace(/^\.?\//, ""))
            .filter(Boolean);
        } else {
          for (const sub of ["pi", "extensions"]) {
            const extDir = path.join(pkgDir, sub);
            if (!fs.existsSync(extDir)) continue;
            try {
              resources.extensions = fs
                .readdirSync(extDir)
                .filter(
                  (f) =>
                    f.endsWith(".js") ||
                    f.endsWith(".ts") ||
                    f.endsWith(".mjs"),
                );
            } catch {
              /* ignore */
            }
            if (resources.extensions.length) break;
          }
        }
      }

      const claudePlugin = readJson(
        path.join(pkgDir, ".claude-plugin", "plugin.json"),
      );
      if (claudePlugin?.mcpServers) {
        resources.mcpServers = Object.keys(claudePlugin.mcpServers);
      }

      const skillsDir = path.join(pkgDir, "skills");
      if (fs.existsSync(skillsDir)) {
        try {
          resources.skills = fs
            .readdirSync(skillsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
        } catch {
          /* ignore */
        }
      }

      return {
        name,
        source: src,
        version,
        description,
        resources,
        enabled: true,
      };
    })
    .filter(Boolean);
};

const installPiExtension = async (source) => {
  const result = await runPiCmd(["install", source], PI_CMD_TIMEOUT.install);
  return {
    success: result.success,
    message: result.success ? result.stdout : result.stderr,
  };
};

const uninstallPiExtension = async (source) => {
  const result = await runPiCmd(["remove", source], PI_CMD_TIMEOUT.default);
  return {
    success: result.success,
    message: result.success ? result.stdout : result.stderr,
  };
};

// ==================== Skills ====================

const getPiSkills = () => {
  const extensions = getPiExtensions();
  const all = [];
  for (const ext of extensions) {
    for (const skill of ext.resources.skills) {
      let frontmatter = "";
      const skillMd = path.join(
        PI_NPM_DIR(),
        ext.name,
        "skills",
        skill,
        "SKILL.md",
      );
      try {
        const content = fs.readFileSync(skillMd, { encoding: "utf-8" });
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        frontmatter = match ? match[1] : "";
      } catch {
        /* ignore */
      }
      all.push({ name: skill, package: ext.name, frontmatter });
    }
  }
  return all;
};

// ==================== MCP Servers from Extensions ====================

const getPiMcpServers = () => {
  const extensions = getPiExtensions();
  const all = [];
  for (const ext of extensions) {
    const claudePlugin = readJson(
      path.join(PI_NPM_DIR(), ext.name, ".claude-plugin", "plugin.json"),
    );
    if (claudePlugin?.mcpServers) {
      for (const [name, cfg] of Object.entries(claudePlugin.mcpServers)) {
        all.push({
          serverName: name,
          package: ext.name,
          command: cfg.command,
          args: cfg.args || [],
          config: cfg,
        });
      }
    }
  }
  return all;
};

const getPiMcpTools = async (mcpConfig) => {
  const { getMcpServerTools } = require("./mcp");
  return getMcpServerTools({
    command: mcpConfig.command,
    args: mcpConfig.args || [],
  });
};

// ==================== Usage ====================

const decodePiSessionPath = (encodedDir) => {
  try {
    // Pi Agent 用 -- 替代路径分隔符编码目录名，首尾也有 --
    const sep = path.sep;
    let decoded = encodedDir.replace(/^--|--$/g, "").replace(/--/g, sep);
    // Unix: 还原后需要补前导 /
    if (sep === "/" && !decoded.startsWith("/")) decoded = "/" + decoded;
    return decoded;
  } catch {
    return encodedDir;
  }
};

const readPiUsage = () => {
  const sessionsDir = PI_SESSIONS_DIR();
  if (!fs.existsSync(sessionsDir)) return emptyResult();

  const sessionDirs = fs
    .readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const messageRecords = [];
  const sessionMap = new Map();

  for (const encodedDir of sessionDirs) {
    const dirPath = path.join(sessionsDir, encodedDir);
    const projectPath = decodePiSessionPath(encodedDir);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dirPath, file), {
          encoding: "utf-8",
        });
        const lines = content.split("\n").filter((l) => l.trim());
        let sessionId = "";
        for (const line of lines) {
          try {
            const d = JSON.parse(line);
            if (d.type === "session") {
              sessionId = d.id;
              if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, {
                  sessionId,
                  timestamp: d.timestamp,
                  cwd: d.cwd || projectPath,
                  inputTokens: 0,
                  outputTokens: 0,
                  cacheReadTokens: 0,
                  cacheWriteTokens: 0,
                  totalCost: 0,
                });
              }
            }
            if (d.type === "message" && d.message?.usage) {
              const u = d.message.usage;
              const model = d.message.model || d.model || "unknown";
              const ts = d.timestamp || "";
              const input = u.input || 0;
              const output = u.output || 0;
              const cacheRead = u.cacheRead || 0;
              const cacheWrite = u.cacheWrite || 0;
              const total =
                u.totalTokens || input + output + cacheRead + cacheWrite;

              messageRecords.push({
                sessionId,
                model,
                project: path.basename(projectPath),
                projectPath,
                timestamp: ts,
                date: ts.split("T")[0],
                inputTokens: input,
                outputTokens: output,
                cacheReadTokens: cacheRead,
                cacheWriteTokens: cacheWrite,
                totalTokens: total,
                cost: u.cost?.total || 0,
              });

              if (sessionMap.has(sessionId)) {
                const s = sessionMap.get(sessionId);
                s.inputTokens += input;
                s.outputTokens += output;
                s.cacheReadTokens += cacheRead;
                s.cacheWriteTokens += cacheWrite;
                s.totalCost += u.cost?.total || 0;
                if (ts > s.timestamp) s.timestamp = ts;
              }
            }
          } catch {
            /* skip parse error */
          }
        }
      } catch {
        /* skip file read error */
      }
    }
  }

  return usage.calculateStats(messageRecords, sessionMap, {
    includeCost: true,
  });
};

const emptyResult = () => {
  const now = new Date();
  const contributions = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    contributions.push({
      date: d.toISOString().split("T")[0],
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      models: {},
    });
  }
  return {
    summary: {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0,
      messageCount: 0,
      sessionCount: 0,
    },
    modelStats: [],
    contributions,
    avgTokensPerSession: 0,
    recentSessions: [],
  };
};

// ==================== 目录操作 ====================

const openPiDir = () => {
  const dir = PI_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    window.utools.shellOpenPath(dir);
  } catch {
    /* ignore */
  }
};

const openPiExtDir = () => {
  const dir = PI_NPM_DIR();
  console.log("[openPiExtDir] target dir:", dir, "exists:", fs.existsSync(dir));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    const result = window.utools.shellOpenPath(dir);
    console.log("[openPiExtDir] shellOpenPath result:", result);
  } catch (e) {
    console.error("[openPiExtDir] error:", e.message);
  }
};

// pi 命令是否可用（不存在 = 未安装 Pi Agent）
const isPiInstalled = () => {
  // 1. 已知路径（resolvePiPath 找到真实路径）
  const piBin = resolvePiPath();
  if (piBin && piBin !== "pi") return true;
  // 2. 兜底：shell 执行验证（覆盖 PATH 里但不在候选列表的安装方式）
  try {
    const out = execSync("pi --version", {
      encoding: "utf-8",
      timeout: 8000,
      shell: true,
    });
    return !!out.trim();
  } catch {
    return false;
  }
};

module.exports = {
  readPiSettings,
  writePiSettings,
  readPiModels,
  writePiModels,
  getPiProviderList,
  setPiDefaultProvider,
  setPiDefaultModel,
  updatePiProvider,
  updatePiModel,
  addPiProvider,
  deletePiProvider,
  addPiModel,
  deletePiModel,
  getPiExtensions,
  installPiExtension,
  uninstallPiExtension,
  fetchPiDevPackages,
  isPiInstalled,
  getPiSkills,
  getPiMcpServers,
  getPiMcpTools,
  readPiUsage,
  fetchProviderModels,
  openPiDir,
  openPiExtDir,
  resolvePiPath,
};
