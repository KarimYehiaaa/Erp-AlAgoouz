<template>
  <section class="settings-section">
    <div class="section-title">
      <h2>بيانات المحل</h2>
      <p>هذه البيانات تظهر على الفواتير وعروض الأسعار</p>
    </div>

    <div class="grid grid-2" style="gap: 24px; align-items: start">
      <div class="settings-card" style="margin-bottom: 0">
        <div class="card-header">
          <AppLogo size="lg" />
          <div>
            <strong>{{ settings.company?.name_ar || 'بن العجوز' }}</strong>
            <span>{{ CURRENCY.country }}</span>
          </div>
        </div>

        <div class="fields-grid">
          <div class="form-group">
            <label>اسم المحل</label>
            <input
              v-model="settings.company.name_ar"
              placeholder="بن العجوز"
              :disabled="!canEdit"
            />
          </div>
          <div class="form-group">
            <label>رقم الهاتف</label>
            <input
              v-model="settings.company.phone"
              placeholder="01xxxxxxxxx"
              dir="ltr"
              :disabled="!canEdit"
            />
          </div>
          <div class="form-group full-width">
            <label>العنوان (يظهر على الفاتورة)</label>
            <input
              v-model="settings.company.address"
              placeholder="مثال: شارع التحرير — القاهرة"
              :disabled="!canEdit"
            />
          </div>
          <div class="form-group full-width">
            <label>الشعار التجاري</label>
            <input
              v-model="settings.company.tagline"
              placeholder="للبن التركي الأصيل"
              :disabled="!canEdit"
            />
          </div>
        </div>

        <div class="card-footer">
          <div class="info-value">الشعار: استبدل الملف <code>public/logo.png</code></div>
          <button
            v-permission="'settings.manage'"
            v-if="canEdit"
            class="btn btn-save"
            :disabled="saving"
            @click="saveCompany"
          >
            <AppIcon name="save" :size="16" />
            {{ saving ? 'جاري الحفظ...' : 'حفظ البيانات' }}
          </button>
        </div>
        <p v-if="saveMsg" class="save-msg">{{ saveMsg }}</p>
      </div>

      <!-- Live Thermal Receipt Mockup -->
      <div class="receipt-preview-card card">
        <h4 style="margin-bottom: 12px; font-weight: 700; color: var(--text-muted)">
          معاينة الفاتورة الحرارية المطبوعة
        </h4>
        <div class="thermal-receipt">
          <div class="receipt-header">
            <h3>{{ settings.company.name_ar || 'اسم المحل' }}</h3>
            <p class="tagline">{{ settings.company.tagline || 'شعار المحل يظهر هنا' }}</p>
            <p v-if="settings.company.address" class="meta-line">{{ settings.company.address }}</p>
            <p v-if="settings.company.phone" class="meta-line">{{ settings.company.phone }}</p>
          </div>
          <div class="divider-dotted"></div>
          <div class="receipt-body">
            <div class="meta-row"><span>رقم الفاتورة:</span> <span>#1024</span></div>
            <div class="meta-row">
              <span>التاريخ:</span> <span>{{ new Date().toLocaleDateString('ar-EG') }}</span>
            </div>
            <div class="meta-row"><span>الكاشير:</span> <span>كاشير الفرع</span></div>
            <div class="divider-dotted"></div>
            <div class="items-list">
              <div class="item-row header">
                <span>الصنف</span> <span>الكمية</span> <span>الإجمالي</span>
              </div>
              <div class="item-row">
                <span>بن محوج فاتح</span> <span>1.0</span> <span>220.00 ج.م</span>
              </div>
              <div class="item-row">
                <span>قهوة تركي سادة</span> <span>2.0</span> <span>160.00 ج.م</span>
              </div>
            </div>
            <div class="divider-dotted"></div>
            <div class="total-row"><span>الإجمالي:</span> <span>380.00 ج.م</span></div>
          </div>
          <div class="divider-dotted"></div>
          <div class="receipt-footer">
            <p>شكراً لزيارتكم! نرجو رؤيتكم قريباً</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import AppIcon from '@/components/AppIcon.vue';
import { users as userApi } from '@/api';
import { CURRENCY } from '@/utils/currency';
import { useAuthStore } from '@/stores/auth';
import { useCompanySettings } from '@/composables/useCompanySettings';

const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasPermission('settings.manage'));
const { settings, saving, saveMsg, saveCompany, loadCompanySettings } = useCompanySettings();

onMounted(async () => {
  try {
    const data = (await userApi.settings())?.data || {};
    loadCompanySettings(data);
  } catch {
    /* offline */
  }
});
</script>
