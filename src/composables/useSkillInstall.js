import { ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";

const DEFAULT_CONFIG = {
  getSkillsPath: 'getSkillsPath',
  installSkill: 'installSkill',
  installSkillFromModelScope: 'installSkillFromModelScope',
  completeSkillInstall: 'completeSkillInstall',
  cancelSkillInstall: 'cancelSkillInstall',
};

// TRACE 评测维度（顺序与官方一致）
const TRACE_DIMENSIONS = [
  { key: 'trust', label: '可信任度' },
  { key: 'reliability', label: '可靠性' },
  { key: 'adaptability', label: '适用性' },
  { key: 'convention', label: '规范性' },
  { key: 'effectiveness', label: '有效性' },
];

// 分类 key → 中文名（fetchSkillHubCategories 失败时的兜底）
const SKILLHUB_CATEGORY_FALLBACK = {
  'pay-skill': 'Pay Skill',
  'office-efficiency': '办公效率',
  'content-creation': '内容创作',
  'dev-programming': '开发编程',
  'data-analysis': '数据分析',
  'design-media': '设计多媒体',
  'ai-agent': 'AI Agent',
  'knowledge-management': '知识管理',
  'business-ops': '商业运营',
  education: '教育学习',
  professional: '行业专业',
  'it-ops-security': 'IT 运维与安全',
  'life-service': '生活服务',
};

// 计算 TRACE 评测摘要（算法与官方一致：维度分 = items 均值，总分 = 五维均值）
const buildEvaluation = (data) => {
  if (!data || !data.dimensions) return null;
  const dimScores = {};
  TRACE_DIMENSIONS.forEach(({ key, label }) => {
    const items = data.dimensions[key]?.items;
    const scores = Object.values(items || {})
      .map((i) => i?.score)
      .filter((s) => typeof s === 'number');
    dimScores[key] = {
      key,
      label,
      score: scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0,
    };
  });
  const total =
    TRACE_DIMENSIONS.reduce((sum, { key }) => sum + dimScores[key].score, 0) /
    TRACE_DIMENSIONS.length;
  const rating =
    total >= 4 ? '优秀' : total >= 3 ? '良好' : total >= 2 ? '及格' : '待改进';
  return {
    total: Math.round(total * 10) / 10,
    rating,
    dimensions: dimScores,
    summary: data.summary || data.userSummary || '',
  };
};

export function useSkillInstall(loadSkills, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const showInstallDialog = ref(false);
  const installUrl = ref("");
  const isFetchingInfo = ref(false);
  const isInstalling = ref(false);
  const installInfo = ref(null);
  const installProgress = ref(0);
  const pendingInstall = ref(null);
  const showOverwriteDialog = ref(false);

  let fetchTimer = null;

  const extractSlug = (url) => {
    // SkillHub 新格式: skillhub.cn/skills/{namespace}/{slug}；兼容老格式单段 /skills/{slug}
    const skillhubMatch = url.match(
      /skillhub\.(?:tencent\.com|cn)\/skills\/([^/?#]+)(?:\/([^/?#]+))?/,
    );
    if (skillhubMatch) {
      const first = skillhubMatch[1];
      const second = skillhubMatch[2];
      if (second)
        return { source: 'skillhub', slug: second, namespace: first };
      return { source: 'skillhub', slug: first, namespace: null };
    }
    const modelscopeMatch = url.match(/modelscope\.cn\/skills\/(@?[^/]+\/[^/]+)/);
    if (modelscopeMatch) return { source: 'modelscope', slug: modelscopeMatch[1] };
    return null;
  };

  const doFetchSkillInfo = async ({ source, slug, namespace }) => {
    isFetchingInfo.value = true;
    installInfo.value = null;
    try {
      if (source === 'skillhub') {
        const result = await window.services.fetchSkillInfo(slug, namespace);
        const info = result.data;
        // 并行拉取评测报告与分类（尽力而为，失败不阻塞主流程）
        let evaluation = null;
        let categoryMap = {};
        try {
          const [ev, cat] = await Promise.all([
            window.services.fetchSkillEvaluation(slug, namespace),
            window.services.fetchSkillHubCategories(),
          ]);
          evaluation = ev;
          categoryMap = (cat?.items || []).reduce((acc, c) => {
            acc[c.key] = c.name;
            return acc;
          }, {});
        } catch (e) {
          /* ignore */
        }
        const catKey = info.skill?.category;
        const tags = [];
        const catName = categoryMap[catKey] || SKILLHUB_CATEGORY_FALLBACK[catKey];
        if (catName) tags.push(catName);
        (info.skill?.subCategories || []).forEach((s) => {
          if (s?.name) tags.push(s.name);
        });
        if (info.skill?.labels?.requires_api_key === 'true')
          tags.push('需配置 API Key');
        installInfo.value = {
          source: 'skillhub',
          slug,
          namespace,
          displayName: info.skill?.displayName || slug,
          summary: info.skill?.summary_zh || info.skill?.summary || "暂无描述",
          version: info.latestVersion?.version || "unknown",
          downloads: info.skill?.stats?.downloads || 0,
          author: info.owner?.displayName || info.owner?.handle || "未知",
          tags,
          evaluation: buildEvaluation(evaluation),
        };
      } else if (source === 'modelscope') {
        const result = await window.services.fetchModelScopeSkillInfo(slug);
        const info = result.data;
        installInfo.value = {
          source: 'modelscope',
          slug,
          displayName: info.DisplayName || info.Name || slug.split('/').pop(),
          summary: info.Description || "暂无描述",
          version: "master",
          downloads: info.DownloadCount || 0,
          author: info.Owner || info.SourceDeveloper || "未知"
        };
      }
    } catch (e) {
      MessagePlugin.error("获取 Skill 信息失败: " + e.message);
    } finally {
      isFetchingInfo.value = false;
    }
  };

  watch(installUrl, (newVal) => {
    if (fetchTimer) {
      clearTimeout(fetchTimer);
      fetchTimer = null;
    }
    if (installInfo.value) installInfo.value = null;

    const result = extractSlug(newVal.trim());
    if (!result) return;

    const isCompleteUrl = newVal.includes('skillhub.') || newVal.includes('modelscope.cn');
    if (isCompleteUrl) {
      doFetchSkillInfo(result);
    } else {
      fetchTimer = setTimeout(() => doFetchSkillInfo(result), 500);
    }
  });

  const openInstallDialog = () => {
    installUrl.value = "";
    installInfo.value = null;
    pendingInstall.value = null;
    isFetchingInfo.value = false;
    isInstalling.value = false;
    showInstallDialog.value = true;
  };

  const openInstallWithUrl = (url) => {
    installUrl.value = url;
    installInfo.value = null;
    pendingInstall.value = null;
    isFetchingInfo.value = false;
    isInstalling.value = false;
    showInstallDialog.value = true;
  };

  const openExternal = (url) => {
    window.utools.shellOpenExternal(url);
  };

  const openSkillsDir = () => {
    window.utools.shellOpenPath(window.services[cfg.getSkillsPath]());
  };

  const confirmInstall = async () => {
    if (!installInfo.value) return;
    isInstalling.value = true;
    installProgress.value = 0;

    try {
      let result;
      if (installInfo.value.source === 'skillhub') {
        result = await window.services[cfg.installSkill](
          installInfo.value.slug,
          installInfo.value.version,
          installInfo.value.namespace,
          (progress) => { installProgress.value = progress; }
        );
      } else if (installInfo.value.source === 'modelscope') {
        result = await window.services[cfg.installSkillFromModelScope](
          installInfo.value.slug,
          (progress) => { installProgress.value = progress; }
        );
      }

      pendingInstall.value = result;

      if (result.exists) {
        showInstallDialog.value = false;
        showOverwriteDialog.value = true;
      } else {
        window.services[cfg.completeSkillInstall](result.skillName, result.extractDir);
        MessagePlugin.success(`Skill "${result.skillName}" 安装成功`);
        showInstallDialog.value = false;
        loadSkills();
      }
    } catch (e) {
      MessagePlugin.error("安装失败: " + e.message);
      window.services[cfg.cancelSkillInstall]();
    } finally {
      isInstalling.value = false;
    }
  };

  const overwriteInstall = () => {
    if (!pendingInstall.value) return;
    window.services[cfg.completeSkillInstall](
      pendingInstall.value.skillName,
      pendingInstall.value.extractDir
    );
    MessagePlugin.success(`Skill "${pendingInstall.value.skillName}" 已覆盖安装`);
    pendingInstall.value = null;
    showOverwriteDialog.value = false;
    loadSkills();
  };

  const cancelInstall = () => {
    if (pendingInstall.value) {
      window.services[cfg.cancelSkillInstall](pendingInstall.value.extractDir);
    }
    pendingInstall.value = null;
    showOverwriteDialog.value = false;
  };

  return {
    showInstallDialog,
    installUrl,
    isFetchingInfo,
    isInstalling,
    installInfo,
    installProgress,
    pendingInstall,
    showOverwriteDialog,
    openInstallDialog,
    openInstallWithUrl,
    openExternal,
    openSkillsDir,
    confirmInstall,
    overwriteInstall,
    cancelInstall,
  };
}
