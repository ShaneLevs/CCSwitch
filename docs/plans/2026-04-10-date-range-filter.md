# 使用统计日期筛选功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为使用统计页面添加日期范围筛选功能，支持按指定日期区间查看用量统计，并优化数据加载性能。

**Architecture:** 前端筛选策略 - services.js 返回全量数据及新增的 messageRecords 数组，前端根据日期范围在内存中筛选聚合。增量缓存优化二次加载性能。

**Tech Stack:** Vue 3 Composition API, TDesign Vue Next (DateRangePicker, Dropdown), uTools DB

---

### Task 1: 修改 services.js 返回 messageRecords

**Files:**
- Modify: `public/preload/services.js:869-973` (readClaudeUsage 函数)

**Step 1: 添加 messageRecords 返回字段**

在 `readClaudeUsage()` 函数中，将 `messageRecords` 数组添加到返回对象。

找到返回语句位置（约第965-973行），修改返回对象：

```javascript
return {
  records: allRecords,
  summary,
  modelStats,
  projectStats,
  contributions,
  avgTokensPerSession,
  recentSessions,
  messageRecords // 新增：每条消息原始记录，供前端筛选使用
}
```

同时在空结果返回处（约第976-985行）添加：

```javascript
return {
  records: [],
  summary: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, sessionCount: 0 },
  modelStats: [],
  projectStats: [],
  contributions: [],
  avgTokensPerSession: 0,
  recentSessions: [],
  messageRecords: [] // 新增
}
```

**Step 2: 为 messageRecords 添加 date 字段**

在构建 messageRecords 的循环中（约第824-836行），添加 `date` 字段用于前端筛选：

```javascript
messageRecords.push({
  sessionId,
  model,
  project: projectName,
  projectPath: projectPath,
  timestamp: data.timestamp,
  date: data.timestamp.split('T')[0], // 新增：YYYY-MM-DD 格式，用于日期筛选
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
})
```

**Step 3: 验证修改**

Run: `npm run dev`
Expected: 控制台无报错，插件正常运行

在浏览器控制台执行：
```javascript
const data = window.services.readClaudeUsage();
console.log('messageRecords count:', data.messageRecords?.length);
console.log('sample record:', data.messageRecords?.[0]);
```
Expected: 输出 messageRecords 数量及第一条记录（包含 date 字段）

**Step 4: Commit**

```bash
git add public/preload/services.js
git commit -m "feat(services): readClaudeUsage 新增 messageRecords 返回字段

- 返回每条消息原始记录供前端日期筛选使用
- 每条记录新增 date 字段 (YYYY-MM-DD 格式)"
```

---

### Task 2: 实现增量缓存逻辑

**Files:**
- Modify: `public/preload/services.js:723-986` (readClaudeUsage 函数及周边)

**Step 1: 定义缓存键和缓存相关常量**

在 `readClaudeUsage()` 函数开头（约第723行之前），添加缓存相关定义：

```javascript
const USAGE_CACHE_KEY = 'ccswitch_usage_cache_v1'
```

**Step 2: 实现缓存读取和写入逻辑**

在 `readClaudeUsage()` 函数内部，重构为缓存优先逻辑：

```javascript
readClaudeUsage(forceRefresh = false) {
  try {
    const homeDir = window.utools.getPath('home')
    const projectsDir = path.join(homeDir, '.claude', 'projects')

    // 尝试读取缓存
    if (!forceRefresh) {
      try {
        const cached = window.utools.db.get(USAGE_CACHE_KEY)
        if (cached && cached.data && cached.data.lastProcessedTime) {
          // 检查是否有新文件需要处理
          const newFiles = this._findNewJsonlFiles(projectsDir, cached.data.lastProcessedTime)
          if (newFiles.length === 0) {
            // 无新数据，直接返回缓存
            return cached.data
          }
          // 有新数据，增量处理
          const incrementalData = this._processJsonlFiles(newFiles, cached.data.messageRecords)
          const mergedData = this._mergeUsageData(cached.data, incrementalData)
            // 更新缓存
          window.utools.db.put({
            _id: USAGE_CACHE_KEY,
            data: mergedData,
            _rev: cached._rev
          })
          return mergedData
        }
      } catch (e) {
        console.error('读取缓存失败:', e)
      }
    }

    // 全量处理
    const data = this._processAllUsageData(projectsDir)

    // 写入缓存
    try {
      const existing = window.utools.db.get(USAGE_CACHE_KEY)
      window.utools.db.put({
        _id: USAGE_CACHE_KEY,
        data: data,
        _rev: existing?._rev
      })
    } catch (e) {
      // 缓存写入失败不影响返回
      console.error('写入缓存失败:', e)
    }

    return data
  } catch (error) {
    console.error('读取 Claude usage 数据失败:', error)
    return this._emptyResult()
  }
}
```

**Step 3: 实现辅助函数**

在 `window.services` 对象中添加以下辅助函数：

```javascript
// 空结果模板
_emptyResult() {
  return {
    records: [],
    summary: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, sessionCount: 0 },
    modelStats: [],
    projectStats: [],
    contributions: [],
    avgTokensPerSession: 0,
    recentSessions: [],
    messageRecords: []
  }
},

// 查找新 jsonl 文件
_findNewJsonlFiles(projectsDir, lastProcessedTime) {
  const results = []
  try {
    if (!fs.existsSync(projectsDir)) return results

    const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)

    for (const folderName of projectFolders) {
      const folderPath = path.join(projectsDir, folderName)
      const files = fs.readdirSync(folderPath)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: path.join(folderPath, f),
          mtime: fs.statSync(path.join(folderPath, f)).mtime.getTime()
        }))
        .filter(f => f.mtime > lastProcessedTime)

      results.push(...files.map(f => f.path))
    }
  } catch (e) {
    console.error('查找新文件失败:', e)
  }
  return results
},

// 处理指定的 jsonl 文件列表
_processJsonlFiles(filePaths, existingMessageRecords) {
  const messageRecords = [...existingMessageRecords]
  const sessionMap = new Map()
  const projectMap = new Map()

  // 从已有记录重建 sessionMap 和 projectMap
  for (const record of existingMessageRecords) {
    const sessionId = record.sessionId
    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        sessionId,
        model: record.model,
        project: record.project,
        projectPath: record.projectPath,
        timestamp: record.timestamp,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0
      })
    }
    const session = sessionMap.get(sessionId)
    session.inputTokens += record.inputTokens
    session.outputTokens += record.outputTokens
    session.cacheReadTokens += record.cacheReadTokens
    session.cacheCreationTokens += record.cacheCreationTokens
    if (record.timestamp > session.timestamp) {
      session.timestamp = record.timestamp
    }
  }

  // 处理新文件
  for (const filePath of filePaths) {
    this._processSingleJsonlFile(filePath, messageRecords, sessionMap, projectMap)
  }

  return {
    messageRecords,
    sessionMap,
    projectMap
  }
},

// 处理单个 jsonl 文件
_processSingleJsonlFile(filePath, messageRecords, sessionMap, projectMap) {
  try {
    const relativePath = path.relative(path.join(window.utools.getPath('home'), '.claude', 'projects'), filePath)
    const folderName = relativePath.split(path.sep)[0] || 'unknown'

    const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
    const lines = content.split('\n').filter(line => line.trim())

    // 获取项目路径
    let projectPath = 'unknown'
    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        if (data.cwd) {
          projectPath = data.cwd
          break
        }
      } catch (e) {}
    }
    const projectName = projectPath !== 'unknown' ? path.basename(projectPath) : 'unknown'

    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        if (data.type !== 'assistant' || !data.message?.usage) continue

        const usage = data.message.usage
        const inputTokens = usage.input_tokens || 0
        const outputTokens = usage.output_tokens || 0
        const cacheReadTokens = usage.cache_read_input_tokens || 0
        const cacheCreationTokens = usage.cache_creation_input_tokens || 0
        const model = data.message.model || 'unknown'
        const sessionId = data.sessionId || 'unknown'

        if (inputTokens + outputTokens > 0) {
          messageRecords.push({
            sessionId,
            model,
            project: projectName,
            projectPath,
            timestamp: data.timestamp,
            date: data.timestamp.split('T')[0],
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheCreationTokens,
            totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
          })

          if (!sessionMap.has(sessionId)) {
            sessionMap.set(sessionId, {
              sessionId,
              model,
              project: projectName,
              projectPath,
              timestamp: data.timestamp,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheCreationTokens: 0
            })
          }
          const session = sessionMap.get(sessionId)
          session.inputTokens += inputTokens
          session.outputTokens += outputTokens
          session.cacheReadTokens += cacheReadTokens
          session.cacheCreationTokens += cacheCreationTokens
          if (data.timestamp > session.timestamp) {
            session.timestamp = data.timestamp
          }

          const projectPathKey = projectPath || 'unknown'
          if (!projectMap.has(projectPathKey)) {
            const exists = projectPathKey !== 'unknown' ? fs.existsSync(projectPathKey) : false
            projectMap.set(projectPathKey, {
              name: projectName,
              path: projectPathKey,
              exists,
              sessions: new Set(),
              tokens: 0,
              inputTokens: 0,
              outputTokens: 0
            })
          }
          const proj = projectMap.get(projectPathKey)
          proj.sessions.add(sessionId)
          proj.tokens += inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
          proj.inputTokens += inputTokens + cacheCreationTokens + cacheReadTokens
          proj.outputTokens += outputTokens
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error('处理文件失败:', filePath, e)
  }
},

// 合并缓存数据和新数据
_mergeUsageData(cachedData, incrementalData) {
  const messageRecords = incrementalData.messageRecords
  const sessionMap = incrementalData.sessionMap
  const projectMap = incrementalData.projectMap

  // 计算最新的处理时间
  const latestTime = Math.max(
    cachedData.lastProcessedTime,
    ...messageRecords.map(r => new Date(r.timestamp).getTime())
  )

  // 计算汇总
  const summary = messageRecords.reduce((acc, record) => {
    acc.inputTokens += record.inputTokens
    acc.outputTokens += record.outputTokens
    acc.cacheReadTokens += record.cacheReadTokens
    acc.cacheCreationTokens += record.cacheCreationTokens
    acc.totalTokens += record.totalTokens
    return acc
  }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, sessionCount: sessionMap.size })

  // 计算模型分布
  const modelMap = new Map()
  messageRecords.forEach(record => {
    if (!modelMap.has(record.model)) {
      modelMap.set(record.model, { name: record.model, sessions: new Set(), tokens: 0, inputTokens: 0, outputTokens: 0 })
    }
    const stat = modelMap.get(record.model)
    stat.sessions.add(record.sessionId)
    stat.tokens += record.totalTokens
    stat.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
    stat.outputTokens += record.outputTokens
  })
  const modelStats = Array.from(modelMap.values())
    .map(stat => ({ ...stat, sessions: stat.sessions.size }))
    .sort((a, b) => b.tokens - a.tokens)

  // 计算项目分布
  const projectStats = Array.from(projectMap.values())
    .map(stat => ({ ...stat, sessions: stat.sessions.size }))
    .sort((a, b) => b.tokens - a.tokens)

  // 计算会话记录
  const allRecords = Array.from(sessionMap.values()).map(session => ({
    ...session,
    totalTokens: session.inputTokens + session.outputTokens + session.cacheReadTokens + session.cacheCreationTokens
  })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  // 计算贡献墙（365天）
  const now = new Date()
  const contributionMap = new Map()
  const totalDays = 365
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateKey = d.toISOString().split('T')[0]
    contributionMap.set(dateKey, { date: dateKey, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
  }
  messageRecords.forEach(record => {
    const dateKey = record.date
    if (contributionMap.has(dateKey)) {
      const day = contributionMap.get(dateKey)
      day.tokens += record.totalTokens
      day.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
      day.outputTokens += record.outputTokens
      if (!day.models[record.model]) {
        day.models[record.model] = { inputTokens: 0, outputTokens: 0 }
      }
      day.models[record.model].inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
      day.models[record.model].outputTokens += record.outputTokens
    }
  })
  const contributions = Array.from(contributionMap.values())

  const avgTokensPerSession = sessionMap.size > 0 ? Math.round(summary.totalTokens / sessionMap.size) : 0

  const recentSessions = allRecords.slice(0, 10)

  return {
    records: allRecords,
    summary,
    modelStats,
    projectStats,
    contributions,
    avgTokensPerSession,
    recentSessions,
    messageRecords,
    lastProcessedTime: latestTime
  }
},

// 全量处理所有数据
_processAllUsageData(projectsDir) {
  // 这里复用原有的 readClaudeUsage 核心逻辑
  // ...（原有代码移至此函数，返回带 lastProcessedTime 的数据）
  // 最后添加 lastProcessedTime: Date.now()
}
```

**Step 4: 添加 forceRefresh 参数到现有调用**

修改 `readClaudeUsage` 函数签名，默认参数为 `false`。

**Step 5: 验证缓存功能**

Run: `npm run dev`

首次加载后，在浏览器控制台检查：
```javascript
const cached = window.utools.db.get('ccswitch_usage_cache_v1');
console.log('Cache exists:', cached !== null);
console.log('Cache data:', cached?.data?.summary);
```

刷新页面，观察加载速度变化。

**Step 6: Commit**

```bash
git add public/preload/services.js
git commit -m "feat(services): 实现增量缓存优化加载性能

- 首次加载后缓存计算结果到 uTools db
- 二次加载只处理新增 jsonl 文件
- 添加 forceRefresh 参数支持强制全量刷新"
```

---

### Task 3: 添加日期筛选 UI 组件

**Files:**
- Modify: `src/Switch/UsageView.vue`

**Step 1: 导入 DateRangePicker 和 Dropdown 组件**

在 `<script setup>` 的 import 语句中（第2-4行），添加：

```javascript
import { Card, Statistic, Empty, Button, Tag, Tooltip, MessagePlugin, DateRangePicker, Dropdown, DropdownMenu, DropdownItem } from "tdesign-vue-next";
```

添加 CalendarIcon 导入（第5-16行的图标导入区域）：

```javascript
import {
  RefreshIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  TimeIcon,
  LayersIcon,
  ChartIcon,
  SumIcon,
  FileAddIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarIcon,
} from "tdesign-icons-vue-next";
```

**Step 2: 添加日期范围状态变量**

在 `usageData` ref 定义之后（约第23-36行），添加：

```javascript
const dateRange = ref([]); // 日期范围 [startDate, endDate]
const isFiltering = computed(() => dateRange.value && dateRange.value.length === 2);
```

**Step 3: 添加快捷选项处理函数**

在 `loadData` 函数之前（约第84行），添加：

```javascript
// 快捷选项处理
const handleQuickSelect = (type) => {
  const today = new Date();
  if (type === '7days') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    dateRange.value = [formatDateString(start), formatDateString(today)];
  } else if (type === '30days') {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    dateRange.value = [formatDateString(start), formatDateString(today)];
  } else if (type === 'clear') {
    dateRange.value = [];
  }
};

// 日期格式化 YYYY-MM-DD
const formatDateString = (date) => {
  return date.toISOString().split('T')[0];
};
```

**Step 4: 添加日期选择器 UI**

在 `.usage-header` 区域（约第114-120行的 template），修改为：

```vue
<div class="usage-header">
  <span class="usage-tip">当前统计数据仅用于展示处理的 token 数量，不做其他参考。</span>
  <div class="usage-actions">
    <Dropdown>
      <template #dropdown>
        <DropdownMenu>
          <DropdownItem @click="handleQuickSelect('7days')">最近7天</DropdownItem>
          <DropdownItem @click="handleQuickSelect('30days')">最近30天</DropdownItem>
          <DropdownItem v-if="isFiltering" @click="handleQuickSelect('clear')">清除筛选</DropdownItem>
        </DropdownMenu>
      </template>
      <Button size="small" variant="outline">
        <template #icon><CalendarIcon /></template>
        日期筛选
      </Button>
    </Dropdown>
    <DateRangePicker
      v-model="dateRange"
      size="small"
      placeholder="选择日期范围"
      :clearable="true"
      @clear="dateRange = []"
    />
    <Button size="small" variant="outline" :loading="loading" @click="handleRefresh">
      <template #icon><RefreshIcon /></template>
      刷新数据
    </Button>
  </div>
</div>
```

**Step 5: 添加样式**

在 `<style scoped>` 区域末尾添加：

```css
.usage-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.usage-actions :deep(.t-date-picker) {
  width: 220px;
}
```

**Step 6: 验证 UI 显示**

Run: `npm run dev`

打开使用统计页面，检查：
- 日期筛选按钮和下拉菜单是否显示
- DateRangePicker 是否正常工作
- 快捷选项点击是否更新日期范围

**Step 7: Commit**

```bash
git add src/Switch/UsageView.vue
git commit -m "feat(UsageView): 添加日期筛选 UI 组件

- 新增 DateRangePicker 日期范围选择器
- 新增 Dropdown 快捷选项（最近7天、30天、清除筛选）
- 添加日期范围状态变量 dateRange"
```

---

### Task 4: 实现前端筛选计算逻辑

**Files:**
- Modify: `src/Switch/UsageView.vue`

**Step 1: 添加筛选计算函数**

在 `handleQuickSelect` 函数之后，添加筛选计算逻辑：

```javascript
// 根据日期范围筛选数据
const filteredData = computed(() => {
  const raw = usageData.value;
  if (!isFiltering.value) {
    return raw;
  }

  const [startDate, endDate] = dateRange.value;
  const records = raw.messageRecords || [];

  // 筛选日期范围内的记录
  const filteredRecords = records.filter(r => {
    return r.date >= startDate && r.date <= endDate;
  });

  if (filteredRecords.length === 0) {
    return {
      summary: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, sessionCount: 0 },
      modelStats: [],
      projectStats: [],
      avgTokensPerSession: 0,
    };
  }

  // 重新计算汇总
  const summary = filteredRecords.reduce((acc, r) => {
    acc.inputTokens += r.inputTokens;
    acc.outputTokens += r.outputTokens;
    acc.cacheReadTokens += r.cacheReadTokens;
    acc.cacheCreationTokens += r.cacheCreationTokens;
    acc.totalTokens += r.totalTokens;
    return acc;
  }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0 });

  // 重新计算会话数（去重 sessionId）
  const sessionSet = new Set(filteredRecords.map(r => r.sessionId));
  summary.sessionCount = sessionSet.size;

  // 重新计算模型分布
  const modelMap = new Map();
  filteredRecords.forEach(r => {
    if (!modelMap.has(r.model)) {
      modelMap.set(r.model, { name: r.model, sessions: new Set(), tokens: 0, inputTokens: 0, outputTokens: 0 });
    }
    const stat = modelMap.get(r.model);
    stat.sessions.add(r.sessionId);
    stat.tokens += r.totalTokens;
    stat.inputTokens += r.inputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    stat.outputTokens += r.outputTokens;
  });
  const modelStats = Array.from(modelMap.values())
    .map(s => ({ ...s, sessions: s.sessions.size }))
    .sort((a, b) => b.tokens - a.tokens);

  // 重新计算项目分布
  const projectMap = new Map();
  filteredRecords.forEach(r => {
    const key = r.projectPath || 'unknown';
    if (!projectMap.has(key)) {
      projectMap.set(key, {
        name: r.project,
        path: key,
        exists: key !== 'unknown' ? true : false, // 简化处理
        sessions: new Set(),
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
    }
    const stat = projectMap.get(key);
    stat.sessions.add(r.sessionId);
    stat.tokens += r.totalTokens;
    stat.inputTokens += r.inputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    stat.outputTokens += r.outputTokens;
  });
  const projectStats = Array.from(projectMap.values())
    .map(s => ({ ...s, sessions: s.sessions.size }))
    .sort((a, b) => b.tokens - a.tokens);

  const avgTokensPerSession = summary.sessionCount > 0
    ? Math.round(summary.totalTokens / summary.sessionCount)
    : 0;

  return {
    summary,
    modelStats,
    projectStats,
    avgTokensPerSession,
  };
});
```

**Step 2: 修改统计卡片数据源**

将 `getStatValue` 函数（约第72-82行）修改为使用筛选后的数据：

```javascript
const getStatValue = (key) => {
  const data = filteredData.value;
  switch (key) {
    case "total": return data.summary.totalTokens;
    case "input": return data.summary.inputTokens;
    case "cacheCreation": return data.summary.cacheCreationTokens;
    case "cacheRead": return data.summary.cacheReadTokens;
    case "output": return data.summary.outputTokens;
    case "sessions": return data.summary.sessionCount;
    case "avg": return data.avgTokensPerSession;
    default: return 0;
  }
};
```

**Step 3: 修改模型分布数据源**

将 `displayedModelStats` computed（约第52-55行）修改为：

```javascript
const displayedModelStats = computed(() => {
  if (showAllModels.value) return filteredData.value.modelStats;
  return filteredData.value.modelStats.slice(0, displayLimit);
});

const hasMoreModels = computed(() => filteredData.value.modelStats.length > displayLimit);
```

**Step 4: 修改项目分布数据源**

将 `displayedProjectStats` computed（约第57-60行）修改为：

```javascript
const displayedProjectStats = computed(() => {
  if (showAllProjects.value) return filteredData.value.projectStats;
  return filteredData.value.projectStats.slice(0, displayLimit);
});

const hasMoreProjects = computed(() => filteredData.value.projectStats.length > displayLimit);
```

**Step 5: 修改模型/项目分布的总 tokens 参考**

在模型分布的进度条计算中（约第184行），修改：

```javascript
<div class="model-bar" :style="{ width: (model.tokens / (filteredData.summary.totalTokens || 1) * 100) + '%' }"></div>
```

项目分布同理（约第227行）。

**Step 6: 验证筛选功能**

Run: `npm run dev`

测试场景：
1. 选择日期范围，检查统计卡片数值是否变化
2. 检查模型分布、项目分布是否按范围重新统计
3. 清除筛选，检查是否恢复全量数据
4. 使用快捷选项（最近7天、30天）

**Step 7: Commit**

```bash
git add src/Switch/UsageView.vue
git commit -m "feat(UsageView): 实现前端日期筛选计算逻辑

- 添加 filteredData computed 根据日期范围筛选
- 统计卡片、模型分布、项目分布使用筛选后数据
- 贡献墙保持全量数据不变"
```

---

### Task 5: 修改刷新按钮支持强制全量刷新

**Files:**
- Modify: `src/Switch/UsageView.vue`
- Modify: `public/preload/services.js`

**Step 1: 在 UsageView.vue 添加 handleRefresh 函数**

修改刷新按钮的处理函数：

```javascript
const handleRefresh = async () => {
  loading.value = true;
  await nextTick();

  // 清除缓存，强制全量刷新
  try {
    window.utools.db.remove('ccswitch_usage_cache_v1');
  } catch (e) {
    // 缓存可能不存在
  }

  setTimeout(() => {
    try {
      const data = window.services.readClaudeUsage(true); // forceRefresh = true
      usageData.value = data;
    } catch {
      // keep defaults
    }
    loading.value = false;
  }, 50);
};
```

将模板中的刷新按钮 `@click="loadData"` 改为 `@click="handleRefresh"`。

**Step 2: 验证刷新功能**

Run: `npm run dev`

点击刷新按钮，检查：
- 数据是否重新加载
- 筛选范围是否保持不变（如果之前选择了日期）

**Step 3: Commit**

```bash
git add src/Switch/UsageView.vue public/preload/services.js
git commit -m "feat: 刷新按钮支持强制全量重新计算

- handleRefresh 清除缓存后调用 readClaudeUsage(true)
- 筛选范围保持不变"
```

---

### Task 6: 最终验证和清理

**Step 1: 完整功能测试**

Run: `npm run dev`

验证清单：
- [ ] 打开使用统计页面，数据正常显示
- [ ] 二次打开页面，加载速度明显提升（<0.5秒）
- [ ] 选择日期范围，统计卡片即时更新
- [ ] 模型分布、项目分布按筛选范围重新统计
- [ ] 贡献墙保持365天全量展示
- [ ] 快捷选项（最近7天、30天）正常工作
- [ ] 清除筛选恢复全量数据
- [ ] 刷新按钮强制全量重新计算
- [ ] 刷新后保持当前筛选范围

**Step 2: 构建测试**

Run: `npm run build`
Expected: 构建成功，无报错

**Step 3: 最终 Commit（如有遗漏修改）**

```bash
git add -A
git commit -m "feat: 完成使用统计日期筛选功能"
```