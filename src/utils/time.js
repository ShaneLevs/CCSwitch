/**
 * Format a timestamp as a relative time string (Chinese locale).
 * @param {number|null} timestamp - Unix timestamp in milliseconds
 * @returns {string}
 */
export function formatLastUsed(timestamp) {
  if (!timestamp) return "从未使用";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? "刚刚" : `${diffMinutes} 分钟前`;
    }
    return `${diffHours} 小时前`;
  } else if (diffDays === 1) return "昨天";
  else if (diffDays < 7) return `${diffDays} 天前`;
  else if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  else return date.toLocaleDateString("zh-CN");
}
