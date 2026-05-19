import { ref, computed } from "vue";
import { MessagePlugin } from "tdesign-vue-next";

const SAVED_FIELD_KEYS_ID = "extra_field_keys";
export const fixedFieldKeyOptions = [
  "API_TIMEOUT_MS",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "CLAUDE_CODE_NO_FLICKER",
  "CLAUDE_CODE_EFFORT_LEVEL",
  "CLAUDE_CODE_ATTRIBUTION_HEADER",
];
const managedFields = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
];

export function useExtraFields(loadCurrentConfig, savedConfigs, isCurrentConfig) {
  const showExtraFieldsDialog = ref(false);
  const extraFields = ref([]);
  const activeConfigExtras = ref(null); // { name, extraFields }
  const savedExtraFieldKeys = ref([]);
  const extraFieldKeyOptions = computed(() => {
    const all = [...fixedFieldKeyOptions, ...savedExtraFieldKeys.value];
    const unique = [...new Set(all)];
    return unique.map(k => ({ label: k, value: k }));
  });

  const loadExtraFieldKeys = () => {
    const doc = window.utools.db.get(SAVED_FIELD_KEYS_ID);
    savedExtraFieldKeys.value = doc?.keys || [];
  };

  // 通过和前端一样的逻辑找到当前生效的配置
  const findActiveConfig = () => {
    if (!savedConfigs || !isCurrentConfig) return null;
    for (const config of savedConfigs.value || []) {
      if (isCurrentConfig(config)) return config;
    }
    return null;
  };

  const loadGlobalExtraFields = () => {
    const saved = window.services.getOverriddenEnv();
    if (saved) {
      extraFields.value = Object.keys(saved).map(key => ({ key, value: String(saved[key]) }));
    } else {
      const settings = window.services.readClaudeSettings() || {};
      const env = settings.env || {};
      extraFields.value = [];
      Object.keys(env).forEach(key => {
        if (!managedFields.includes(key)) {
          extraFields.value.push({ key, value: String(env[key]) });
        }
      });
    }
  };

  const openExtraFieldsDialog = () => {
    loadExtraFieldKeys();
    // 通过和前端一样的逻辑找到当前生效的配置
    const active = findActiveConfig();
    if (active) {
      activeConfigExtras.value = { name: active.name, extraFields: active.extraFields || [] };
    } else {
      activeConfigExtras.value = null;
    }
    // 从 DB 读全局基准，没有则从 settings.json 兜底
    let saved = window.services.getOverriddenEnv();
    if (saved && Object.keys(saved).length) {
      extraFields.value = Object.keys(saved).map(key => ({ key, value: String(saved[key]) }));
    } else {
      const settings = window.services.readClaudeSettings() || {};
      const env = settings.env || {};
      extraFields.value = [];
      Object.keys(env).forEach(key => {
        if (!managedFields.includes(key)) {
          extraFields.value.push({ key, value: String(env[key]) });
        }
      });
    }
    showExtraFieldsDialog.value = true;
  };

  const addExtraField = () => extraFields.value.push({ key: '', value: '' });
  const removeExtraField = (idx) => extraFields.value.splice(idx, 1);

  const saveExtraFieldKeys = (keys) => {
    const userKeys = keys.filter(k => k && !fixedFieldKeyOptions.includes(k));
    if (!userKeys.length) return;
    const existingDoc = window.utools.db.get(SAVED_FIELD_KEYS_ID);
    const existing = existingDoc?.keys || [];
    const merged = [...new Set([...existing, ...userKeys])];
    const doc = { _id: SAVED_FIELD_KEYS_ID, keys: merged };
    if (existingDoc) doc._rev = existingDoc._rev;
    window.utools.db.put(doc);
  };

  const saveExtraFields = () => {
    // 检查重复 key
    const keys = extraFields.value.map(f => f.key?.trim()).filter(Boolean);
    const duplicateKey = keys.find((k, i) => keys.indexOf(k) !== i);
    if (duplicateKey) return MessagePlugin.warning(`env字段 key 重复: ${duplicateKey}`);

    // 1. 构建全局 extras 并存 DB
    const globalExtras = {};
    const userKeys = [];
    extraFields.value.forEach(field => {
      const key = field.key.trim();
      const value = field.value.trim();
      if (key) {
        globalExtras[key] = value;
        if (!fixedFieldKeyOptions.includes(key)) userKeys.push(key);
      }
    });
    window.services.saveOverriddenEnv(globalExtras);

    // 2. 合并：全局 + 当前活跃配置的 extraFields（配置优先）
    const mergedExtras = { ...globalExtras };
    const configExtras = (activeConfigExtras.value?.extraFields) || [];
    configExtras.forEach(field => {
      const k = field.key?.trim();
      const v = field.value?.trim();
      if (k) mergedExtras[k] = v;
    });

    // 3. 写入 settings.json
    const settings = window.services.readClaudeSettings() || {};
    if (!settings.env) settings.env = {};
    Object.keys(settings.env).forEach(key => {
      if (!managedFields.includes(key)) delete settings.env[key];
    });
    Object.entries(mergedExtras).forEach(([k, v]) => {
      settings.env[k] = v;
    });

    // 4. 保存候选字段名
    const mergedKeysDoc = { _id: SAVED_FIELD_KEYS_ID, keys: [...new Set([...savedExtraFieldKeys.value, ...userKeys])] };
    const existingDoc = window.utools.db.get(SAVED_FIELD_KEYS_ID);
    if (existingDoc) mergedKeysDoc._rev = existingDoc._rev;
    window.utools.db.put(mergedKeysDoc);

    if (window.services.writeClaudeSettings(settings)) {
      MessagePlugin.success("全局设置已保存");
      showExtraFieldsDialog.value = false;
      loadCurrentConfig();
    } else {
      MessagePlugin.error("保存失败");
    }
  };

  return {
    showExtraFieldsDialog,
    extraFields,
    activeConfigExtras,
    extraFieldKeyOptions,
    loadExtraFieldKeys,
    loadGlobalExtraFields,
    openExtraFieldsDialog,
    addExtraField,
    removeExtraField,
    saveExtraFields,
    saveExtraFieldKeys,
  };
}
