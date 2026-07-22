# 批量编辑聚合组 URL + Key 设计

日期: 2026-07-22

## 背景

Claude Code 配置视图（`ConfigView.vue`）会按 `key|baseUrl` 把保存的配置自动聚合成卡片组。当前痛点：要给一组同源配置换 key（或 url）时，只能逐个点行内「编辑」按钮改，繁琐。

## 目标

在聚合卡片头部 hover 时，右侧出现一个编辑图标按钮，点击后打开弹窗，可一次性把该组所有配置的 URL 和 Key 改成新值。模型字段不在批量范围内（仍走单配置编辑）。

## 交互流程

1. 鼠标 hover 到组头部 `.group-conn` → 右侧淡入编辑按钮（`EditIcon`）。
2. 点击该按钮 → 打开「批量编辑此组」弹窗，字段：URL、TOKEN，均预填该组当前值。
3. 点「保存」→ 遍历该组所有 config，更新 DB 文档的 `baseUrl` 与加密后的 `key`（保留 `_rev`、`updatedAt`、其余字段不动）→ 关闭弹窗 → `loadSavedConfigs()` 重新聚合。
4. 若该组含「当前启用」的配置，保存后自动重新 `switchConfig`，把新 url/key 同步写进 `settings.json`。

## 关键细节

- 组的 `key` 在内存里是解密明文（`loadSavedConfigs` 调用了 `decryptKey`），保存时需重新 `encryptKey` 再写库。
- 改 URL/Key 会改变组身份 `key|baseUrl`；若新值与另一组相同，`groupedConfigs` 会自动合并——自然结果，无需特殊处理。
- 单配置组也显示该按钮（保持一致）。
- 头部 `.group-conn` 现为 `@mousedown` 拖拽手柄。编辑按钮需 `@click.stop` + `@mousedown.stop`，避免点按钮误触拖拽。

## 实现

全部改动集中在 `src/Switch/ConfigView.vue` 与 `src/Switch/styles/ConfigView.css`，不动 composable。

### ConfigView.vue — script

新增响应式状态：

```js
const showBatchEditDialog = ref(false);
const batchEditGroup = ref(null);
const batchUrl = ref("");
const batchKey = ref("");
```

新增方法：

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
  let touchedActive = false;
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
      if (isCurrentConfig(config)) {
        touchedActive = true;
        activeConfig = config;
      }
    }
  });

  MessagePlugin.success(`已更新 ${group.configs.length} 个配置`);
  showBatchEditDialog.value = false;
  batchEditGroup.value = null;
  loadSavedConfigs();
  // 若改的是当前启用配置，重新写入 settings.json
  if (touchedActive && activeConfig) {
    const updated = {
      ...activeConfig,
      baseUrl: url,
      key,
    };
    switchConfig(updated);
  }
};
```

### ConfigView.vue — template

两列的 `.group-conn`（左列 line 508-511、右列 line 536-539）均改为：

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

新增弹窗（与现有 Dialog 同级）：

```html
<Dialog v-model:visible="showBatchEditDialog" header="批量编辑此组" width="480px" @confirm="saveBatchEdit">
  <div class="form">
    <div class="form-item"><label>URL <span class="required">*</span></label><Input v-model="batchUrl" placeholder="ANTHROPIC_BASE_URL" /></div>
    <div class="form-item"><label>TOKEN <span class="required">*</span></label><Input v-model="batchKey" type="password" placeholder="ANTHROPIC_AUTH_TOKEN" /></div>
  </div>
  <div class="batch-edit-hint">将更新本组共 {{ batchEditGroup?.configs.length }} 个配置的 URL 与 Key。</div>
</Dialog>
```

### ConfigView.css

```css
.group-conn { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--td-component-border); font-family: monospace; font-size: 12px; cursor: grab; user-select: none; }
.group-conn-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.group-conn-actions { flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
.group-conn:hover .group-conn-actions { opacity: 1; }
```

`.group-key` / `.group-url` 原有样式（颜色、省略号）保持不变，只是包进了 `.group-conn-info`。

新增提示样式：

```css
.batch-edit-hint { margin-top: 12px; font-size: 12px; color: var(--td-text-color-placeholder); }
```

## 验证

- 多配置组：hover 头部 → 出现编辑图标 → 点击弹窗预填正确 → 改 url+key 保存 → 该组所有 config 的 baseUrl/key 更新，组重新聚合。
- 改动后新值与另一组相同 → 自动合并为一组。
- 改动含当前启用配置 → `settings.json` 同步刷新为新值。
- 单配置组：按钮也出现，功能正常。
- 编辑按钮点击不触发拖拽。
- 深色模式下样式正常（均用 TDesign CSS 变量）。
