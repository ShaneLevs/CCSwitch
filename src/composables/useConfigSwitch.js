import { MessagePlugin } from "tdesign-vue-next";

export function useConfigSwitch(currentConfig, loadCurrentConfig) {
  const switchConfig = (config) => {
    const settings = window.services.readClaudeSettings() || {};
    if (!settings.env) settings.env = {};

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
