<template>
  <section class="settings-section">
    <div class="section-title">
      <h2>الصوتيات والمنبهات</h2>
      <p>إدارة المؤثرات الصوتية والمنبهات التفاعلية بنظام الكاشير (POS)</p>
    </div>

    <div class="settings-card">
      <div class="form-group full-width">
        <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px">
          <input type="checkbox" v-model="soundEnabled" />
          <span>تفعيل الأصوات التفاعلية في الكاشير</span>
        </label>
      </div>

      <div class="form-group" :class="{ disabled: !soundEnabled }" style="margin-top: 20px">
        <label style="display: flex; justify-content: space-between">
          <span>مستوى صوت التنبيهات</span>
          <strong>{{ Math.round(soundVolume * 100) }}%</strong>
        </label>
        <input
          v-model.number="soundVolume"
          type="range"
          min="0.01"
          max="0.30"
          step="0.01"
          :disabled="!soundEnabled"
          style="width: 100%; cursor: pointer"
        />
        <span class="field-hint">مستوى الصوت الموصى به: 0.08 (80%)</span>
      </div>

      <hr class="divider" style="margin: 20px 0" />

      <h4 style="margin-bottom: 12px; font-weight: 800">تجربة واختبار نغمات الصوت:</h4>
      <div style="display: flex; gap: 12px">
        <button
          type="button"
          class="btn btn-outline"
          :disabled="!soundEnabled"
          @click="playTestBeep('success')"
        >
          نغمة نجاح العملية
        </button>
        <button
          type="button"
          class="btn btn-outline"
          :disabled="!soundEnabled"
          @click="playTestBeep('warning')"
        >
          نغمة التحذير
        </button>
        <button
          type="button"
          class="btn btn-outline"
          :disabled="!soundEnabled"
          @click="playTestBeep('error')"
        >
          نغمة خطأ
        </button>
      </div>

      <div
        class="card-footer"
        style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border)"
      >
        <button class="btn btn-save" @click="saveSettingsLocally">حفظ إعدادات الصوت</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useAudioSettings } from '@/composables/useAudioSettings';

const { soundEnabled, soundVolume, saveSettingsLocally, playTestBeep } = useAudioSettings();
</script>
