// 共享 JSONL 处理管线 — Claude / Pi 复用
// 导出处理函数和工具，调用方传入 schema 映射函数适配各自格式

const fillEmptyContributions = (contributions) => {
  const now = new Date()
  const dateMap = new Map()
  for (const d of contributions) dateMap.set(d.date, d)
  const result = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    result.push(dateMap.get(key) || { date: key, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
  }
  return result
}

const calculateStats = (messageRecords, sessionMap, options = {}) => {
  const includeCost = options.includeCost || false
  const sessionArr = Array.from(sessionMap.values()).map(s => ({
    ...s, totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreationTokens + s.cacheWriteTokens,
  }))
  sessionArr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const summaryInit = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, cacheWriteTokens: 0, totalTokens: 0, messageCount: messageRecords.length, sessionCount: sessionMap.size }
  if (includeCost) summaryInit.totalCost = 0

  const summary = messageRecords.reduce((acc, r) => {
    acc.inputTokens += r.inputTokens
    acc.outputTokens += r.outputTokens
    acc.cacheReadTokens += r.cacheReadTokens
    if (r.cacheCreationTokens) acc.cacheCreationTokens += r.cacheCreationTokens
    if (r.cacheWriteTokens) acc.cacheWriteTokens += r.cacheWriteTokens
    acc.totalTokens += r.totalTokens
    if (includeCost && r.cost) acc.totalCost += r.cost
    return acc
  }, summaryInit)

  const modelMap = new Map()
  messageRecords.forEach(r => {
    if (!modelMap.has(r.model)) modelMap.set(r.model, { name: r.model, tokens: 0, inputTokens: 0, outputTokens: 0 })
    const m = modelMap.get(r.model)
    m.tokens += r.totalTokens; m.inputTokens += r.inputTokens; m.outputTokens += r.outputTokens
  })
  const modelStats = Array.from(modelMap.values()).sort((a, b) => b.tokens - a.tokens)

  const contributionMap = new Map()
  messageRecords.forEach(r => {
    if (!contributionMap.has(r.date)) contributionMap.set(r.date, { date: r.date, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
    const d = contributionMap.get(r.date)
    d.tokens += r.totalTokens; d.inputTokens += r.inputTokens; d.outputTokens += r.outputTokens
    if (!d.models[r.model]) d.models[r.model] = { inputTokens: 0, outputTokens: 0 }
    d.models[r.model].inputTokens += r.inputTokens; d.models[r.model].outputTokens += r.outputTokens
  })

  const contributions = fillEmptyContributions(Array.from(contributionMap.values()).sort((a, b) => a.date.localeCompare(b.date)))
  const avgTokensPerSession = sessionMap.size > 0 ? Math.round(summary.totalTokens / sessionMap.size) : 0
  const recentSessions = sessionArr.slice(0, 10)

  return { summary, modelStats, contributions, avgTokensPerSession, recentSessions, messageRecords }
}

module.exports = { fillEmptyContributions, calculateStats }
