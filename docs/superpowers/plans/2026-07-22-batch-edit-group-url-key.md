# 批量编辑聚合组 URL+Key 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Claude Code 配置视图的聚合卡片头部 hover 时显示编辑按钮，点击后弹窗批量修改该组所有配置的 URL 与 Key。

**Architecture:** 全部改动集中在 `ConfigView.vue`（script 状态/方法 + template 头部结构与新弹窗）与 `ConfigView.css`（头部 flex 布局 + hover 淡入）。不动 composable。组的 key 在内存里是解密明文，保存时重新 `encryptKey` 写库；若改动涉及当前启用配置则自动重新 `switchConfig` 同步 `settings.json`。

**Tech Stack:** Vue 3 Composition API、TDesign Vue Next（Dialog/Input/Button/Tooltip）、uTools db。

## Global Constraints

- 组身份 = `${config.key}|${config.baseUrl}`，改 URL/Key 后 `groupedConfigs` 会自动重新聚合/合并，无需特殊处理。
- 组的 `key` 字段在 `loadSavedConfigs` 里已 `decryptKey` 为明文；写库时必须 `window.services.encryptKey` 重新加密。
- 头部 `.group-conn` 是 `@mousedown` 拖拽手柄，新增按钮需 `@click.stop` + `@mousedown.stop`。
- 文本色一律用 TDesign CSS 变量（`var(--td-text-color-*)`、`var(--td-bg-color-*)`）以兼容深色模式。
- `EditIcon` 已从 `tdesign-icons-vue-next` 导入，无需新增 import。

---

## File Structure

- Modify: `src/Switch/ConfigView.vue` — 新增响应式状态、`openBatchEditDialog` / `saveBatchEdit` 方法、左/右列头部模板结构、新弹窗。
- Modify: `src/Switch/styles/ConfigView.css` — `.group-conn` 改 flex 横向；新增 `.group-conn-info` / `.group-conn-actions` / `.batch-edit-hint`。

无新文件。无 composable 改动。

---

### Task 1: 新增批量编辑状态与方法（script）

**Files:**
- Modify: `src/Switch/ConfigView.vue`（script 区域，建议放在 `saveConfig` / `deleteConfig` 附近）

**Interfaces:**
- Consumes: `MessagePlugin`（已导入）、`window.services.encryptKey`、`window.utools.db.get/put`、`isCurrentConfig`、`switchConfig`（来自 `useConfigSwitch`，已在 line 322 解构）、`loadSavedConfigs`。
- Produces: `showBatchEditDialog` (ref<boolean>)、`batchEditGroup` (ref<object|null>)、`batchUrl` (ref<string>)、`batchKey` (ref<string>)、`openBatchEditDialog(group)`、`saveBatchEdit()` —— 供 Task 3 的 template 使用。

- [ ] **Step 1: 在 script 里新增响应式状态**

在 `const savedConfigs = ref([]);`（line 52）附近的 ref 声明区，新增：

```js
const showBatchEditDialog = ref(false);
const batchEditGroup = ref(null);
const batchUrl = ref("");
const batchKey = ref("");
```

- [ ] **Step 2: 新增 `openBatchEditDialog` 与 `saveBatchEdit` 方法**

在 `deleteConfig` 方法（约 line 313-320）之后、`const { switchConfig, isCurrentConfig } = useConfigSwitch(...)`（line 322）之前插入。注意：方法内用到 `isCurrentConfig` 和 `switchConfig`，它们在 line 322 才解构；由于这是函数体内引用且函数运行时（用户点击时）才调用，`const` 提升在模块顶层 setup 同步执行后已完成，运行时调用安全。为避免阅读顺序困惑，仍放在 line 322 之后更稳妥——实际放置位置改为 `const { switchConfig, isCurrentConfig } = useConfigSwitch(...);` 这一行之后。

```js
const openBatchEditDialog = (group) => {
  batchEditGroup.value = group;
  batchUrl.value = group.baseUrl;
  batchKey.value = group.key;
  showBatchEditDialog.value = true;
};

const saveBatchEdit = () => {
  const group = batchEditGroup.value;
  if (!group) return;
  const url = batchUrl.value.trim();
  const key = batchKey.value.trim();
  if (!url) return MessagePlugin.warning("请输入 URL");
  if (!key) return MessagePlugin.warning("请输入 Key");

  const now = Date.now();
  let activeConfig = null;

  group.configs.forEach(config => {
    const existing = window.utools.db.get(config.id);
    if (!existing) return;
    const doc = {
      ...existing,
      baseUrl: url,
      key: window.services.encryptKey(key),
      updatedAt: now,
    };
    if (window.utools.db.put(doc).ok) {
      if (isCurrentConfig(config)) activeConfig = config;
    }
  });

  const count = group.configs.length;
  MessagePlugin.success(`已更新 ${count} 个配置`);
  showBatchEditDialog.value = false;
  batchEditGroup.value = null;
  loadSavedConfigs();
  if (activeConfig) {
    switchConfig({ ...activeConfig, baseUrl: url, key });
  }
};
```

- [ ] **Step 3: 构建验证无语法/import 错误**

Run: `npm run build`
Expected: 构建成功，无报错（此时 template 还未引用新状态，纯 script 改动不影响渲染）。

- [ ] **Step 4: 提交**

```bash
git add src/Switch/ConfigView.vue
git commit -m "feat: 新增聚合组批量编辑 URL+Key 的状态与方法"
```

---

### Task 2: 头部 CSS 改 flex 布局 + hover 淡入

**Files:**
- Modify: `src/Switch/styles/ConfigView.css`（替换 `.group-conn` 块，line 17-18）

**Interfaces:**
- Produces: `.group-conn`（flex 横向）、`.group-conn-info`、`.group-conn-actions`（hover 淡入）—— 供 Task 3 的 template class 使用。

- [ ] **Step 1: 替换 `.group-conn` 样式块**

将 line 17-18 的：

```css
.group-conn { display: flex; flex-direction: column; gap: 2px; padding: 10px 16px; border-bottom: 1px solid var(--td-component-border); font-family: monospace; font-size: 12px; cursor: grab; user-select: none; }
.group-conn:active { cursor: grabbing; }
```

替换为：

```css
.group-conn { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--td-component-border); font-family: monospace; font-size: 12px; cursor: grab; user-select: none; }
.group-conn:active { cursor: grabbing; }
.group-conn-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.group-conn-actions { flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
.group-conn:hover .group-conn-actions { opacity: 1; }
```

`.group-key` / `.group-url`（line 19-20）保持不变，它们会被包进 `.group-conn-info`。

- [ ] **Step 2: 新增批量编辑提示样式**

在 `.group-name` 样式（line 25）之后追加：

```css
.batch-edit-hint { margin-top: 12px; font-size: 12px; color: var(--td-text-color-placeholder); }
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 提交**

```bash
git add src/Switch/styles/ConfigView.css
git commit -m "style: 聚合组头部改 flex 布局 + hover 显示编辑按钮"
```

---

### Task 3: 头部 template 加编辑按钮 + 新增批量编辑弹窗

**Files:**
- Modify: `src/Switch/ConfigView.vue`（左列模板 line 508-511、右列模板 line 536-539；新增 Dialog 在现有 Dialog 同级）

**Interfaces:**
- Consumes: Task 1 的 `showBatchEditDialog` / `batchEditGroup` / `batchUrl` / `batchKey` / `openBatchEditDialog` / `saveBatchEdit`；`EditIcon`（已导入）；TDesign `Dialog`/`Input`/`Button`/`Tooltip`（已导入）。
- Consumes: Task 2 的 `.group-conn-info` / `.group-conn-actions` / `.batch-edit-hint` class。

- [ ] **Step 1: 改左列头部模板**

将左列（line 508-511）：

```html
<div class="group-conn" @mousedown="onDragMouseDown('left', idx, $event)">
  <span class="group-key">{{ maskKey(group.key) }}</span>
  <span class="group-url">{{ group.baseUrl }}</span>
</div>
```

替换为：

```html
<div class="group-conn" @mousedown="onDragMouseDown('left', idx, $event)">
  <div class="group-conn-info">
    <span class="group-key">{{ maskKey(group.key) }}</span>
    <span class="group-url">{{ group.baseUrl }}</span>
  </div>
  <div class="group-conn-actions" @click.stop @mousedown.stop>
    <Tooltip content="批量编辑 URL 和 Key" placement="top">
      <Button size="small" theme="default" variant="text" @click="openBatchEditDialog(group)"><EditIcon /></Button>
    </Tooltip>
  </div>
</div>
```

- [ ] **Step 2: 改右列头部模板**

将右列（line 536-539）：

```html
<div class="group-conn" @mousedown="onDragMouseDown('right', idx, $event)">
  <span class="group-key">{{ maskKey(group.key) }}</span>
  <span class="group-url">{{ group.baseUrl }}</span>
</div>
```

替换为：

```html
<div class="group-conn" @mousedown="onDragMouseDown('right', idx, $event)">
  <div class="group-conn-info">
    <span class="group-key">{{ maskKey(group.key) }}</span>
    <span class="group-url">{{ group.baseUrl }}</span>
  </div>
  <div class="group-conn-actions" @click.stop @mousedown.stop>
    <Tooltip content="批量编辑 URL 和 Key" placement="top">
      <Button size="small" theme="default" variant="text" @click="openBatchEditDialog(group)"><EditIcon /></Button>
    </Tooltip>
  </div>
</div>
```

- [ ] **Step 3: 新增批量编辑弹窗**

在「清除配置弹窗」（`<Dialog v-model:visible="showClearDialog" ...>` 块，约 line 757）之前，插入：

```html
<Dialog v-model:visible="showBatchEditDialog" header="批量编辑此组" width="480px" @confirm="saveBatchEdit">
  <div class="form">
    <div class="form-item"><label>URL <span class="required">*</span></label><Input v-model="batchUrl" placeholder="ANTHROPIC_BASE_URL" /></div>
    <div class="form-item"><label>TOKEN <span class="required">*</span></label><Input v-model="batchKey" type="password" placeholder="ANTHROPIC_AUTH_TOKEN" /></div>
  </div>
  <div class="batch-edit-hint">将更新本组共 {{ batchEditGroup?.configs.length }} 个配置的 URL 与 Key。</div>
</Dialog>
```

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 构建成功，无模板编译错误。

- [ ] **Step 5: 提交**

```bash
git add src/Switch/ConfigView.vue
git commit -m "feat: 聚合组头部 hover 显示批量编辑按钮 + 弹窗"
```

---

### Task 4: 手动验证

**Files:** 无（运行时验证）

- [ ] **Step 1: 启动开发模式**

Run: `npm run dev`
Expected: Vite 在 `localhost:5173` 启动成功。然后在 uTools 里打开 CCConfig 的 Claude Code 配置视图。

- [ ] **Step 2: 多配置组验证**

场景：存在一组 ≥2 个同 key+url 的配置。
操作：hover 该组头部 → 右侧淡入编辑图标 → 点击 → 弹窗预填的 URL/Key 与该组一致 → 改 URL 和 Key → 保存。
Expected: 提示「已更新 N 个配置」；该组所有配置的 baseUrl/key 更新；重新聚合后仍为一组（key+url 都改）或按新值重新分组。

- [ ] **Step 3: 合并验证**

场景：改后的 key+url 与另一已存在组相同。
Expected: 两组自动合并为一组。

- [ ] **Step 4: 当前启用配置同步验证**

场景：被改的组里含「当前」启用的配置。
Expected: 保存后 `~/.claude/settings.json` 的 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 同步为新值（当前配置卡片显示新值）。

- [ ] **Step 5: 拖拽不误触验证**

操作：点击头部编辑按钮（不拖动）。
Expected: 弹窗正常打开，不触发拖拽。拖拽手柄其余区域仍可正常拖动整组。

- [ ] **Step 6: 深色模式验证**

切换系统深色模式。
Expected: 头部按钮、弹窗、提示文字颜色正常，无硬编码色。

- [ ] **Step 7: 完成提交（如有遗留改动）**

```bash
git status
# 若有改动则 git add + git commit -m "test: 手动验证通过"
```

---

## Self-Review

**1. Spec coverage:**
- hover 头部右侧出现编辑图标 → Task 3 Step 1/2 + Task 2 的 `.group-conn-actions` hover 淡入。✓
- 点击后弹窗批量编辑 URL+Key → Task 3 Step 3 弹窗 + Task 1 `saveBatchEdit`。✓
- 遍历组内 config 更新 baseUrl + 加密 key，保留 `_rev`/`updatedAt`/其余字段 → Task 1 `saveBatchEdit` 用 `{...existing, baseUrl, key, updatedAt}`，`existing` 含 `_rev`。✓
- 含当前启用配置则重新 `switchConfig` → Task 1 `if (activeConfig) switchConfig(...)`。✓
- `@click.stop` + `@mousedown.stop` 防误触拖拽 → Task 3。✓
- 单配置组也显示按钮 → 模板无 count 判断，所有组都渲染。✓
- 深色模式用 CSS 变量 → Task 2 用 `var(--td-text-color-placeholder)` 等。✓

**2. Placeholder scan:** 无 TBD/TODO/"add error handling"；每个步骤都有完整代码。✓

**3. Type consistency:** `openBatchEditDialog(group)` / `saveBatchEdit()` 在 Task 1 定义，Task 3 template 引用名一致；`batchEditGroup.configs.length` 与 `loadSavedConfigs` 里 group 结构 `{key, baseUrl, configs}` 一致。✓
