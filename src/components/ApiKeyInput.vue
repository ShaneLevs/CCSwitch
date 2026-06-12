<script setup>
import { ref } from "vue";
import { Input } from "tdesign-vue-next";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "API Key" },
});

const emit = defineEmits(["update:modelValue"]);
const visible = ref(false);
</script>

<template>
  <div class="api-key-input">
    <Input
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      @change="(val) => emit('update:modelValue', val)"
    >
      <template #suffixIcon>
        <span
          class="toggle-visibility"
          @click="visible = !visible"
          :title="visible ? '隐藏' : '显示'"
        >
          {{ visible ? '🙈' : '👁' }}
        </span>
      </template>
    </Input>
  </div>
</template>

<style scoped>
.api-key-input { width: 100%; }
.toggle-visibility {
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  user-select: none;
  opacity: 0.7;
}
.toggle-visibility:hover { opacity: 1; }
</style>
