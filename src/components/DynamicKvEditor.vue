<script setup>
import { ref } from "vue";
import { Button, Input, AutoComplete, Tag } from "tdesign-vue-next";
import { AddIcon, DeleteIcon } from "tdesign-icons-vue-next";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  keyOptions: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  keyPlaceholder: { type: String, default: "字段名" },
  valuePlaceholder: { type: String, default: "字段值" },
  showAdd: { type: Boolean, default: true },
});

const emit = defineEmits(["update:modelValue"]);

const addField = () => {
  emit("update:modelValue", [...props.modelValue, { key: "", value: "" }]);
};

const removeField = (idx) => {
  const newVal = [...props.modelValue];
  newVal.splice(idx, 1);
  emit("update:modelValue", newVal);
};

const updateKey = (idx, newKey) => {
  const newVal = props.modelValue.map((f, i) =>
    i === idx ? { ...f, key: newKey } : f
  );
  emit("update:modelValue", newVal);
};

const updateValue = (idx, newValue) => {
  const newVal = props.modelValue.map((f, i) =>
    i === idx ? { ...f, value: newValue } : f
  );
  emit("update:modelValue", newVal);
};

const onBlurCommitKey = (idx, e) => {
  updateKey(idx, e.target.value);
};
</script>

<template>
  <div class="dynamic-kv-editor">
    <div v-for="(field, idx) in modelValue" :key="idx" class="kv-field-wrap">
      <div class="kv-field-row">
        <template v-if="readonly">
          <div class="kv-key-readonly">{{ field.key }}</div>
          <div class="kv-value-readonly">{{ field.value }}</div>
        </template>
        <template v-else>
          <AutoComplete
            :value="field.key"
            class="kv-key"
            :options="keyOptions"
            filterable
            :placeholder="keyPlaceholder"
            @blur="onBlurCommitKey(idx, $event)"
            @change="(val) => updateKey(idx, val)"
          />
          <Input
            :value="field.value"
            class="kv-value"
            :placeholder="valuePlaceholder"
            @change="(val) => updateValue(idx, val)"
          />
          <Button
            size="small"
            theme="danger"
            variant="text"
            @click="removeField(idx)"
          >
            <DeleteIcon />
          </Button>
        </template>
      </div>
    </div>
    <Button
      v-if="showAdd && !readonly"
      size="small"
      variant="outline"
      @click="addField"
      class="kv-add-btn"
    >
      <template #icon><AddIcon /></template> 添加字段
    </Button>
  </div>
</template>

<style scoped>
.dynamic-kv-editor { display: flex; flex-direction: column; gap: 8px; }
.kv-field-row { display: flex; gap: 8px; align-items: center; }
.kv-key { flex: 1; }
.kv-value { flex: 1; }
.kv-key-readonly { flex: 1; font-size: 12px; color: var(--td-text-color-secondary); word-break: break-all; }
.kv-value-readonly { flex: 1; font-size: 12px; color: var(--td-text-color-primary); word-break: break-all; }
.kv-add-btn { align-self: flex-start; }
</style>
