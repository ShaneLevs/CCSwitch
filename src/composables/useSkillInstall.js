import { ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";

export function useSkillInstall(loadSkills) {
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
    const skillhubMatch = url.match(/skillhub\.(tencent\.com|cn)\/skills\/([^/]+)/);
    if (skillhubMatch) return { source: 'skillhub', slug: skillhubMatch[2] };
    const modelscopeMatch = url.match(/modelscope\.cn\/skills\/(@?[^/]+\/[^/]+)/);
    if (modelscopeMatch) return { source: 'modelscope', slug: modelscopeMatch[1] };
    return null;
  };

  const doFetchSkillInfo = async ({ source, slug }) => {
    isFetchingInfo.value = true;
    installInfo.value = null;
    try {
      if (source === 'skillhub') {
        const result = await window.services.fetchSkillInfo(slug);
        const info = result.data;
        installInfo.value = {
          source: 'skillhub',
          slug,
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
    window.utools.shellOpenPath(window.services.getSkillsPath());
  };

  const confirmInstall = async () => {
    if (!installInfo.value) return;
    isInstalling.value = true;
    installProgress.value = 0;

    try {
      let result;
      if (installInfo.value.source === 'skillhub') {
        result = await window.services.installSkill(
          installInfo.value.slug,
          installInfo.value.version,
          (progress) => { installProgress.value = progress; }
        );
      } else if (installInfo.value.source === 'modelscope') {
        result = await window.services.installSkillFromModelScope(
          installInfo.value.slug,
          (progress) => { installProgress.value = progress; }
        );
      }

      pendingInstall.value = result;

      if (result.exists) {
        showInstallDialog.value = false;
        showOverwriteDialog.value = true;
      } else {
        window.services.completeSkillInstall(result.skillName, result.extractDir);
        MessagePlugin.success(`Skill "${result.skillName}" 安装成功`);
        showInstallDialog.value = false;
        loadSkills();
      }
    } catch (e) {
      MessagePlugin.error("安装失败: " + e.message);
      window.services.cancelSkillInstall();
    } finally {
      isInstalling.value = false;
    }
  };

  const overwriteInstall = () => {
    if (!pendingInstall.value) return;
    window.services.completeSkillInstall(
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
      window.services.cancelSkillInstall(pendingInstall.value.extractDir);
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
