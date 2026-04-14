# MCP Toggle Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent toggle switches for each MCP configuration, storing disabled MCPs in uTools DB by nativeId isolation.

**Architecture:** Each MCP gets a Switch component on its card. Disabled MCPs are moved from `.claude.json` to uTools DB (keyed by nativeId + mcpName). Re-enabling restores from DB. New services.js methods handle the state transitions.

**Tech Stack:** Vue 3 Composition API, TDesign Vue Next (Switch component), uTools DB API

---

## File Structure

| File | Responsibility |
|------|----------------|
| `public/preload/services.js` | MCP state management: getNativeId, getDisabledMcpServers, disableMcpServer, enableMcpServer, deleteDisabledMcpServer, getAllMcpServersWithStatus |
| `src/Switch/McpView.vue` | UI: Switch component, status display, toggle logic, conditional edit/delete actions |

---

### Task 1: Add getNativeId method to services.js

**Files:**
- Modify: `public/preload/services.js:63-64` (after `window.services = {`)

- [ ] **Step 1: Add getNativeId method**

Add this method inside `window.services` object, right after the opening brace:

```javascript
  // 获取电脑唯一标识
  getNativeId() {
    return window.utools.getNativeId()
  },
```

- [ ] **Step 2: Commit**

```bash
git add public/preload/services.js
git commit -m "feat(mcp-toggle): add getNativeId method"
```

---

### Task 2: Add getDisabledMcpServers method to services.js

**Files:**
- Modify: `public/preload/services.js` (add after getNativeId method)

- [ ] **Step 1: Add getDisabledMcpServers method**

Add this method after `getNativeId()`:

```javascript
  // 获取本机关闭的 MCP 配置列表
  getDisabledMcpServers() {
    try {
      const nativeId = this.getNativeId()
      const prefix = `ccswitch_mcp_disabled_${nativeId}_`
      const docs = window.utools.db.allDocs()
        .filter(d => d._id.startsWith(prefix))
        .map(d => ({
          name: d.name,
          config: d.config,
          updatedAt: d.updatedAt
        }))
      return docs.sort((a, b) => b.updatedAt - a.updatedAt)
    } catch (error) {
      console.error('获取关闭的 MCP 配置失败:', error)
      return []
    }
  },
```

- [ ] **Step 2: Commit**

```bash
git add public/preload/services.js
git commit -m "feat(mcp-toggle): add getDisabledMcpServers method"
```

---

### Task 3: Add disableMcpServer method to services.js

**Files:**
- Modify: `public/preload/services.js` (add after getDisabledMcpServers method)

- [ ] **Step 1: Add disableMcpServer method**

Add this method after `getDisabledMcpServers()`:

```javascript
  // 关闭 MCP：从 .claude.json 移除，保存到 uTools DB
  disableMcpServer(name) {
    try {
      // 1. 读取当前配置
      const config = this.getMcpServers()
      if (!config[name]) {
        return { success: false, error: 'MCP 配置不存在' }
      }

      // 2. 保存到 DB
      const nativeId = this.getNativeId()
      const docId = `ccswitch_mcp_disabled_${nativeId}_${name}`
      const existingDoc = window.utools.db.get(docId)

      const doc = {
        _id: docId,
        name: name,
        config: config[name],
        nativeId: nativeId,
        updatedAt: Date.now()
      }
      if (existingDoc) doc._rev = existingDoc._rev

      const result = window.utools.db.put(doc)
      if (!result.ok) {
        return { success: false, error: '保存到 DB 失败' }
      }

      // 3. 从 .claude.json 删除
      this.deleteMcpServer(name)

      return { success: true }
    } catch (error) {
      console.error('关闭 MCP 失败:', error)
      return { success: false, error: error.message }
    }
  },
```

- [ ] **Step 2: Commit**

```bash
git add public/preload/services.js
git commit -m "feat(mcp-toggle): add disableMcpServer method"
```

---

### Task 4: Add enableMcpServer method to services.js

**Files:**
- Modify: `public/preload/services.js` (add after disableMcpServer method)

- [ ] **Step 1: Add enableMcpServer method**

Add this method after `disableMcpServer()`:

```javascript
  // 开启 MCP：从 DB 恢复，写入 .claude.json
  enableMcpServer(name) {
    try {
      const nativeId = this.getNativeId()
      const docId = `ccswitch_mcp_disabled_${nativeId}_${name}`
      const doc = window.utools.db.get(docId)

      if (!doc) {
        return { success: false, error: 'DB 中未找到该 MCP 配置' }
      }

      // 写入 .claude.json
      const success = this.upsertMcpServer(name, doc.config)
      if (!success) {
        return { success: false, error: '写入配置文件失败' }
      }

      // 删除 DB 记录
      window.utools.db.remove(docId)

      return { success: true }
    } catch (error) {
      console.error('开启 MCP 失败:', error)
      return { success: false, error: error.message }
    }
  },
```

- [ ] **Step 2: Commit**

```bash
git add public/preload/services.js
git commit -m "feat(mcp-toggle): add enableMcpServer method"
```

---

### Task 5: Add deleteDisabledMcpServer method to services.js

**Files:**
- Modify: `public/preload/services.js` (add after enableMcpServer method)

- [ ] **Step 1: Add deleteDisabledMcpServer method**

Add this method after `enableMcpServer()`:

```javascript
  // 删除关闭状态的 MCP 配置（从 DB 删除）
  deleteDisabledMcpServer(name) {
    try {
      const nativeId = this.getNativeId()
      const docId = `ccswitch_mcp_disabled_${nativeId}_${name}`
      const doc = window.utools.db.get(docId)

      if (!doc) {
        return { success: false, error: '配置不存在' }
      }

      const result = window.utools.db.remove(docId)
      return { success: result.ok, error: result.ok ? null : '删除失败' }
    } catch (error) {
      console.error('删除关闭的 MCP 配置失败:', error)
      return { success: false, error: error.message }
    }
  },
```

- [ ] **Step 2: Commit**

```bash
git add public/preload/services.js
git commit -m "feat(mcp-toggle): add deleteDisabledMcpServer method"
```

---

### Task 6: Add getAllMcpServersWithStatus method to services.js

**Files:**
- Modify: `public/preload/services.js` (add after deleteDisabledMcpServer method)

- [ ] **Step 1: Add getAllMcpServersWithStatus method**

Add this method after `deleteDisabledMcpServer()`:

```javascript
  // 获取所有 MCP 配置及其状态（合并开启和关闭的）
  getAllMcpServersWithStatus() {
    try {
      const enabledServers = this.getMcpServers()
      const disabledServers = this.getDisabledMcpServers()
      const result = []

      // 开启的 MCP
      for (const [name, config] of Object.entries(enabledServers)) {
        result.push({
          name,
          config,
          enabled: true
        })
      }

      // 关闭的 MCP（排除已在开启列表中的同名配置）
      for (const server of disabledServers) {
        if (!enabledServers[server.name]) {
          result.push({
            name: server.name,
            config: server.config,
            enabled: false,
            updatedAt: server.updatedAt
          })
        }
      }

      return result.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error('获取 MCP 状态列表失败:', error)
      return []
    }
  },
```

- [ ] **Step 2: Commit**

```bash
git add public/preload/services.js
git commit -m "feat(mcp-toggle): add getAllMcpServersWithStatus method"
```

---

### Task 7: Update McpView.vue imports and data loading

**Files:**
- Modify: `src/Switch/McpView.vue:1-21` (imports section)
- Modify: `src/Switch/McpView.vue:21-48` (data and loadMcpServers)

- [ ] **Step 1: Add Switch component to imports**

Replace the import section (lines 1-21):

```vue
<script setup>
import { ref, onMounted, computed } from "vue";
import {
  Card,
  Button,
  Input,
  Dialog,
  MessagePlugin,
  Tag,
  Space,
  Empty,
  Textarea,
  Popconfirm,
  Switch,
} from "tdesign-vue-next";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
} from "tdesign-icons-vue-next";
```

- [ ] **Step 2: Update loadMcpServers to use getAllMcpServersWithStatus**

Replace lines 46-48:

```javascript
// 加载 MCP 配置（带状态）
const loadMcpServers = () => {
  mcpServerList.value = window.services.getAllMcpServersWithStatus();
};
```

- [ ] **Step 3: Change mcpServers ref to mcpServerList**

Replace line 21:

```javascript
const mcpServerList = ref([]);
```

- [ ] **Step 4: Remove the computed mcpServerList**

Remove lines 57-62 (the computed `mcpServerList` that transforms `mcpServers`).

- [ ] **Step 5: Commit**

```bash
git add src/Switch/McpView.vue
git commit -m "feat(mcp-toggle): update imports and data loading"
```

---

### Task 8: Add toggle and delete handlers to McpView.vue

**Files:**
- Modify: `src/Switch/McpView.vue` (add new methods after loadMcpServers)

- [ ] **Step 1: Add toggleMcpStatus method**

Add after `loadMcpServers()`:

```javascript
// 切换 MCP 状态
const toggleMcpStatus = (server) => {
  if (server.enabled) {
    // 关闭
    const result = window.services.disableMcpServer(server.name);
    if (result.success) {
      MessagePlugin.success("MCP 已关闭");
      loadMcpServers();
    } else {
      MessagePlugin.error(result.error || "关闭失败");
    }
  } else {
    // 开启
    const result = window.services.enableMcpServer(server.name);
    if (result.success) {
      MessagePlugin.success("MCP 已开启");
      loadMcpServers();
    } else {
      MessagePlugin.error(result.error || "开启失败");
    }
  }
};
```

- [ ] **Step 2: Update deleteMcpServer method**

Replace the existing `deleteMcpServer` function (lines 162-169):

```javascript
// 删除 MCP 配置
const deleteMcpServer = (server) => {
  let result;
  if (server.enabled) {
    result = window.services.deleteMcpServer(server.name);
  } else {
    result = window.services.deleteDisabledMcpServer(server.name);
  }
  if (result.success) {
    MessagePlugin.success("MCP 配置已删除");
    loadMcpServers();
  } else {
    MessagePlugin.error(result.error || "删除失败");
  }
};
```

- [ ] **Step 3: Commit**

```bash
git add src/Switch/McpView.vue
git commit -m "feat(mcp-toggle): add toggle and delete handlers"
```

---

### Task 9: Update McpView.vue template - Card actions area

**Files:**
- Modify: `src/Switch/McpView.vue:210-240` (mcp-list section)

- [ ] **Step 1: Update Card template to include Switch and status handling**

Replace the mcp-list section (lines 210-240):

```vue
    <div v-else class="mcp-list">
      <Card
        v-for="server in mcpServerList"
        :key="server.name + '-' + (server.enabled ? 'on' : 'off')"
        :title="server.name"
        :bordered="true"
        class="mcp-card"
      >
        <template #actions>
          <Space>
            <Switch
              :value="server.enabled"
              @change="toggleMcpStatus(server)"
              size="small"
            />
            <Tag :theme="getTypeTagTheme(server.config.type)" variant="light">
              {{ getTypeTag(server.config.type) }}
            </Tag>
            <Tag v-if="!server.enabled" theme="default" variant="light" size="small">
              已关闭
            </Tag>
            <Button
              size="small"
              theme="default"
              variant="text"
              :disabled="!server.enabled"
              @click="openEditDialog(server)"
              title="编辑"
            >
              <EditIcon />
            </Button>
            <Popconfirm
              theme="danger"
              content="确定要删除这个 MCP 配置吗？"
              @confirm="deleteMcpServer(server)"
            >
              <Button size="small" theme="danger" variant="text" title="删除">
                <DeleteIcon />
              </Button>
            </Popconfirm>
          </Space>
        </template>

        <div class="mcp-info">
          <div class="info-item config-summary">
            {{ getConfigSummary(server.config) || '无详细配置' }}
          </div>
        </div>
      </Card>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/Switch/McpView.vue
git commit -m "feat(mcp-toggle): update card template with Switch and status"
```

---

### Task 10: Update McpView.vue helper functions for config object

**Files:**
- Modify: `src/Switch/McpView.vue:79-184` (helper functions)

- [ ] **Step 1: Update formatArgs to handle server.config**

Replace line 79:

```javascript
const formatArgs = (args) => {
  if (!args || !Array.isArray(args)) return "";
  return args.join(" ");
};
```

(No change needed - this function is fine as is)

- [ ] **Step 2: Update getConfigSummary to accept config object**

Replace lines 172-184:

```javascript
// 在卡片上显示的配置摘要
const getConfigSummary = (config) => {
  const parts = [];
  if (config.command) {
    parts.push(`cmd: ${config.command}`);
  }
  if (config.url) {
    parts.push(`url: ${config.url}`);
  }
  if (config.args?.length) {
    parts.push(`args: ${config.args.length} 个`);
  }
  return parts.join(" | ");
};
```

(No change needed - function already accepts config object)

- [ ] **Step 3: Commit**

```bash
git add src/Switch/McpView.vue
git commit -m "feat(mcp-toggle): verify helper functions work with new data structure"
```

---

### Task 11: Update openEditDialog for disabled MCP handling

**Files:**
- Modify: `src/Switch/McpView.vue:95-104` (openEditDialog function)

- [ ] **Step 1: Update openEditDialog to work with server object**

Replace lines 95-104:

```javascript
// 打开编辑对话框
const openEditDialog = (server) => {
  if (!server.enabled) {
    return MessagePlugin.warning("请先开启 MCP 后再编辑");
  }
  dialogMode.value = "edit";
  editingName.value = server.name;
  mcpName.value = server.name;
  const config = { ...server.config };
  jsonContent.value = JSON.stringify(config, null, 2);
  jsonError.value = "";
  showDialog.value = true;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/Switch/McpView.vue
git commit -m "feat(mcp-toggle): update openEditDialog for disabled MCP handling"
```

---

### Task 12: Final testing and integration commit

**Files:**
- All modified files

- [ ] **Step 1: Run development server to test**

Run: `npm run dev`

Manual testing checklist:
1. Create a new MCP → should be enabled by default
2. Toggle OFF → MCP should disappear from `.claude.json`, appear in DB
3. Card should show "已关闭" tag
4. Toggle ON → MCP should restore to `.claude.json`
5. Edit button should be disabled when MCP is OFF
6. Delete should work for both enabled and disabled MCPs
7. Switch computers (different nativeId) → disabled MCPs should not appear

- [ ] **Step 2: Fix any issues found during testing**

If issues found, fix them and commit with appropriate message.

- [ ] **Step 3: Final integration commit**

```bash
git add -A
git commit -m "feat(mcp-toggle): complete MCP toggle switch feature"
```

---

## Self-Review

**1. Spec coverage:**
- ✓ getNativeId method → Task 1
- ✓ getDisabledMcpServers method → Task 2
- ✓ disableMcpServer method → Task 3
- ✓ enableMcpServer method → Task 4
- ✓ deleteDisabledMcpServer method → Task 5
- ✓ getAllMcpServersWithStatus method → Task 6
- ✓ Switch component in UI → Task 7, 9
- ✓ Toggle status handler → Task 8
- ✓ Delete handler for both states → Task 8
- ✓ Edit disabled for OFF state → Task 11
- ✓ "已关闭" tag display → Task 9

**2. Placeholder scan:**
- ✓ No TBD/TODO found
- ✓ All code provided in steps
- ✓ No vague descriptions

**3. Type consistency:**
- ✓ `server` object has `name`, `config`, `enabled` properties consistently used
- ✓ All methods return `{ success: boolean, error?: string }` format
- ✓ DB key format `ccswitch_mcp_disabled_${nativeId}_${name}` consistent across all methods