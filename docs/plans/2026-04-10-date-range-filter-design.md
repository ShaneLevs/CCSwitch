# 使用统计日期筛选功能设计

**日期：** 2026-04-10

## 功能概述

为使用统计页面添加日期范围筛选功能，允许用户查看指定日期区间内的用量统计。

## 需求规格

### 用户交互

| 场景 | 行为 |
|------|------|
| 打开页面 | 日期选择器为空，显示全量数据 |
| 选择日期范围 | 统计数据即时更新，显示选定范围内的用量 |
| 清除筛选 | 恢复全量数据展示 |
| 刷新数据 | 强制全量重新计算，清除缓存，保持当前筛选范围 |

### 受影响组件

| 组件 | 筛选行为 |
|------|----------|
| 统计卡片（7项） | 按日期范围重新统计 |
| 模型使用分布 | 按日期范围重新聚合 |
| 项目使用分布 | 按日期范围重新聚合 |
| 贡献墙（Heatmap） | **不受影响**，始终显示365天全量数据 |

### 日期边界规则

- 按日期字符串匹配（`YYYY-MM-DD` 格式）
- 包含起始日期和结束日期（闭区间）
- 例：选择 4月1日至4月8日，统计该8天内所有数据

### 性能要求

| 操作 | 响应时间目标 |
|------|-------------|
| 数据加载（首次） | 2-3秒（保持现状，后续优化） |
| 日期筛选 | <100ms（即时响应） |
| 清除筛选 | <100ms（即时响应） |
| 数据加载（缓存命中） | <0.5秒 |

## UI 设计

### 布局位置

日期选择器位于页面顶部 `.usage-header` 区域，刷新按钮左侧。

### 组件构成

1. **DateRangePicker**：TDesign 日期范围选择器
   - placeholder: "选择日期范围"
   - 支持一次性选择开始和结束日期
   - 支持清除按钮

2. **Dropdown + 快捷选项**：
   - 最近7天
   - 最近30天（一个月）
   - 清除筛选

### 状态展示

- 未选择：显示 placeholder
- 已选择：显示日期范围（如 "2026-04-01 ~ 2026-04-08"）

## 技术设计

### 前端筛选策略

采用方案一（前端筛选）：

1. `services.readClaudeUsage()` 返回全量数据
2. 新增返回字段 `messageRecords`（每条消息原始记录）
3. 前端根据日期范围筛选 `messageRecords`
4. 在内存中重新聚合计算统计数据

### 数据结构扩展

`readClaudeUsage()` 返回值新增：

```javascript
{
  // 现有字段保持不变
  summary: {...},
  modelStats: [...],
  projectStats: [...],
  contributions: [...],
  avgTokensPerSession: 0,

  // 新增字段
  messageRecords: [
    {
      sessionId: string,
      model: string,
      project: string,
      projectPath: string,
      timestamp: string,      // ISO格式，含时间
      date: string,           // YYYY-MM-DD格式，用于筛选
      inputTokens: number,
      outputTokens: number,
      cacheReadTokens: number,
      cacheCreationTokens: number,
      totalTokens: number
    }
  ]
}
```

### 筛选计算逻辑

```javascript
// 核心筛选函数
function filterByDateRange(messageRecords, startDate, endDate) {
  if (!startDate || !endDate) return null; // 返回null表示全量

  return messageRecords.filter(record => {
    return record.date >= startDate && record.date <= endDate;
  });
}

// 聚合计算
function aggregateStats(filteredRecords) {
  // 统计卡片数据
  const summary = calculateSummary(filteredRecords);

  // 模型分布
  const modelStats = aggregateByModel(filteredRecords);

  // 项目分布
  const projectStats = aggregateByProject(filteredRecords);

  return { summary, modelStats, projectStats };
}
```

### 性能优化：增量缓存

**实现策略：**

1. 首次加载后，在 uTools db 中存储：
   - 上次处理的截止时间戳
   - 已处理文件列表（可选）
   - 计算结果缓存

2. 二次加载时：
   - 检查缓存是否存在
   - 只处理新增的 jsonl 文件
   - 合并缓存数据 + 新数据

3. 刷新按钮：
   - 清除缓存标记
   - 强制全量重新计算

**缓存数据结构：**

```javascript
{
  _id: 'ccswitch_usage_cache',
  lastProcessedTime: timestamp,
  summary: {...},
  modelStats: [...],
  projectStats: [...],
  contributions: [...],
  messageRecords: [...]
}
```

## 实现要点

### 修改文件清单

| 文件 | 改动内容 |
|------|----------|
| `public/preload/services.js` | 修改 `readClaudeUsage()`，新增 `messageRecords` 返回，实现增量缓存 |
| `src/Switch/UsageView.vue` | 新增日期选择器UI，实现筛选计算逻辑 |

### 实现顺序

1. 修改 `services.js`，增加 `messageRecords` 返回
2. 实现 `services.js` 增量缓存逻辑
3. 实现 `UsageView.vue` 日期筛选UI
4. 实现前端筛选计算逻辑
5. 测试验证

## 验收标准

- [ ] 日期选择器UI正确显示，快捷选项可用
- [ ] 选择日期范围后，统计卡片数据即时更新
- [ ] 模型分布、项目分布按筛选范围重新统计
- [ ] 贡献墙保持365天全量展示，不受筛选影响
- [ ] 筛选响应时间 <100ms
- [ ] 清除筛选恢复全量数据
- [ ] 刷新按钮强制全量重新计算
- [ ] 缓存命中时加载时间 <0.5秒