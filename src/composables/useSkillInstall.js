import { ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";

const DEFAULT_CONFIG = {
  getSkillsPath: 'getSkillsPath',
  installSkill: 'installSkill',
  installSkillFromModelScope: 'installSkillFromModelScope',
  completeSkillInstall: 'completeSkillInstall',
  cancelSkillInstall: 'cancelSkillInstall',
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
        installInfo.value = {
          source: 'skillhub',
          slug,
          namespace,
          displayName: info.skill?.displayName || slug,
          summary: info.skill?.summary_zh || info.skill?.summary || "暂无描述",
          version: info.latestVersion?.version || "unknown",
          downloads: info.skill?.stats?.downloads || 0,
          author: info.owner?.displayName || info.owner?.handle || "未知"
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
