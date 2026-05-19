import { MessagePlugin } from "tdesign-vue-next";

const managedFields = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
];

export function useConfigSwitch(currentConfig, loadCurrentConfig) {
  const switchConfig = (config) => {
    const settings = window.services.readClaudeSettings() || {};
    if (!settings.env) settings.env = {};

    // 1. 保存当前 settings.json 中的所有 env 其他字段（每次切换都保存）
    const currentGlobalExtras = {};
    Object.keys(settings.env).forEach(key => {
      if (!managedFields.includes(key)) {
        currentGlobalExtras[key] = settings.env[key];
      }
    });
    window.services.saveOverriddenEnv(currentGlobalExtras);
    const baseExtras = currentGlobalExtras;

    // 3. 设置核心字段
    settings.env.ANTHROPIC_AUTH_TOKEN = config.key;
    settings.env.ANTHROPIC_BASE_URL = config.baseUrl;

    const modelFields = [
      { key: 'model', env: 'ANTHROPIC_MODEL' },
      { key: 'defaultHaikuModel', env: 'ANTHROPIC_DEFAULT_HAIKU_MODEL' },
      { key: 'defaultSonnetModel', env: 'ANTHROPIC_DEFAULT_SONNET_MODEL' },
      { key: 'defaultOpusModel', env: 'ANTHROPIC_DEFAULT_OPUS_MODEL' },
      { key: 'subagentModel', env: 'CLAUDE_CODE_SUBAGENT_MODEL' },
    ];

    modelFields.forEach(({ key, env }) => {
      if (config[key]?.trim()) {
        settings.env[env] = config[key].trim();
      } else {
        delete settings.env[env];
      }
    });

    // 4. 清除所有非托管字段
    Object.keys(settings.env).forEach(key => {
      if (!managedFields.includes(key)) delete settings.env[key];
    });

    // 5. 合并：全局字段 + 配置字段（配置优先）
    const mergedExtras = { ...baseExtras };
    const configExtras = config.extraFields || [];
    configExtras.forEach(field => {
      const k = field.key?.trim();
      const v = field.value?.trim();
      if (k) mergedExtras[k] = v;
    });

    // 6. 写入合并后的字段
    Object.entries(mergedExtras).forEach(([k, v]) => {
      settings.env[k] = v;
    });

    if (window.services.writeClaudeSettings(settings)) {
      MessagePlugin.success("配置已切换");
      loadCurrentConfig();
    } else {
      MessagePlugin.error("切换失败");
    }
  };

  const isCurrentConfig = (config) =>
    config.key === currentConfig.value.key &&
    config.baseUrl === currentConfig.value.baseUrl &&
    (config.model || "") === (currentConfig.value.model || "") &&
    (config.defaultHaikuModel || "") === (currentConfig.value.defaultHaikuModel || "") &&
    (config.defaultSonnetModel || "") === (currentConfig.value.defaultSonnetModel || "") &&
    (config.defaultOpusModel || "") === (currentConfig.value.defaultOpusModel || "") &&
    (config.subagentModel || "") === (currentConfig.value.subagentModel || "");

  return { switchConfig, isCurrentConfig };
}
