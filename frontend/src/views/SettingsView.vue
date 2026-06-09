<template>
  <div class="settings-page">

    <!-- ===== Sidebar Navigation ===== -->
    <nav class="settings-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="settings-nav-item"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <span class="nav-icon">{{ tab.icon }}</span>
        <span class="nav-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- ===== Main Content ===== -->
    <div class="settings-content">

      <!-- ── تاب: بيانات المحل ── -->
      <section v-if="activeTab === 'company'" class="settings-section">
        <div class="section-title">
          <h2>🏪 بيانات المحل</h2>
          <p>هذه البيانات تظهر على الفواتير وعروض الأسعار</p>
        </div>

        <div class="settings-card">
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
              <input v-model="settings.company.name_ar" placeholder="بن العجوز" />
            </div>
            <div class="form-group">
              <label>رقم الهاتف</label>
              <input v-model="settings.company.phone" placeholder="01xxxxxxxxx" dir="ltr" />
            </div>
            <div class="form-group full-width">
              <label>العنوان (يظهر على الفاتورة)</label>
              <input v-model="settings.company.address" placeholder="مثال: شارع التحرير — القاهرة" />
            </div>
            <div class="form-group full-width">
              <label>الشعار التجاري</label>
              <input v-model="settings.company.tagline" placeholder="للبن التركي الأصيل" />
            </div>
          </div>

          <div class="card-footer">
            <p class="hint">
              📎 الشعار: <code>assets/logo.png</code> — استبدل الملف مباشرةً لتغيير الشعار
            </p>
            <button class="btn btn-primary" :disabled="saving" @click="saveCompany">
              {{ saving ? 'جاري الحفظ...' : 'حفظ البيانات' }}
            </button>
          </div>
          <p v-if="saveMsg" class="save-msg">✓ {{ saveMsg }}</p>
        </div>
      </section>

      <!-- ── تاب: المظهر ── -->
      <section v-if="activeTab === 'appearance'" class="settings-section">
        <div class="section-title">
          <h2>🎨 المظهر والألوان</h2>
          <p>اختر ستايل يناسب محلّك — يُطبَّق فوراً على كل الصفحات</p>
        </div>

        <div class="settings-card">
          <h4 class="group-label">وضع العرض</h4>
          <div class="mode-row">
            <button
              class="mode-btn"
              :class="{ active: appStore.colorMode === 'light' }"
              @click="setMode('light')"
            >
              <span>☀️</span> فاتح
            </button>
            <button
              class="mode-btn"
              :class="{ active: appStore.colorMode === 'dark' }"
              @click="setMode('dark')"
            >
              <span>🌙</span> داكن
            </button>
          </div>
        </div>

        <div class="settings-card">
          <h4 class="group-label">نمط الألوان</h4>
          <div class="style-grid">
            <button
              v-for="s in STYLE_PRESETS"
              :key="s.id"
              class="style-card"
              :class="{ active: appStore.stylePreset === s.id }"
              :data-preview="s.id"
              @click="appStore.setStylePreset(s.id)"
            >
              <span class="style-icon">{{ s.icon }}</span>
              <strong>{{ s.name }}</strong>
              <small>{{ s.desc }}</small>
            </button>
          </div>
        </div>
      </section>

      <!-- ── تاب: العملة والضريبة ── -->
      <section v-if="activeTab === 'finance'" class="settings-section">
        <div class="section-title">
          <h2>💰 العملة والضريبة</h2>
          <p>إعدادات مالية تؤثر على حسابات الفواتير والتقارير</p>
        </div>

        <div class="settings-card">
          <div class="info-row">
            <span class="info-label">العملة</span>
            <span class="info-value">{{ CURRENCY.symbol }} — {{ CURRENCY.code }} (جنيه مصري)</span>
          </div>
          <div class="info-row">
            <span class="info-label">الدولة</span>
            <span class="info-value">{{ CURRENCY.country }}</span>
          </div>

          <hr class="divider" />

          <div v-if="settings.tax" class="fields-grid">
            <div class="form-group full-width">
              <label class="checkbox-label">
                <input type="checkbox" v-model="settings.tax.enabled" />
                <span>تفعيل ضريبة القيمة المضافة (VAT)</span>
              </label>
            </div>
            <div class="form-group" :class="{ disabled: !settings.tax.enabled }">
              <label>نسبة الضريبة %</label>
              <input
                v-model.number="settings.tax.rate"
                type="number"
                min="0" max="100"
                :disabled="!settings.tax.enabled"
                placeholder="14"
              />
              <span class="field-hint">الافتراضي في مصر: 14%</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ── تاب: التصنيفات ── -->
      <section v-if="activeTab === 'categories'" class="settings-section">
        <div class="section-title">
          <h2>🗂️ تصنيفات المنتجات</h2>
          <p>التصنيفات تساعد في تنظيم المنتجات وتصفيتها في التقارير</p>
        </div>

        <div class="settings-card">
          <div class="add-row">
            <input
              v-model="newCategoryName"
              placeholder="اسم التصنيف الجديد..."
              class="add-input"
              @keyup.enter="addCategory"
            />
            <button class="btn btn-primary" :disabled="categorySaving || !newCategoryName.trim()" @click="addCategory">
              {{ categorySaving ? '...' : '+ إضافة' }}
            </button>
          </div>

          <div class="data-table">
            <div class="data-table-head">
              <span>التصنيف</span>
              <span class="col-num">المنتجات</span>
              <span class="col-actions">الإجراءات</span>
            </div>
            <div v-if="!categories.length" class="data-table-empty">
              لا توجد تصنيفات — أضف أول تصنيف أعلاه
            </div>
            <div v-for="cat in categories" :key="cat.id" class="data-table-row">
              <div class="cell-name">
                <span class="dot primary"></span>
                <template v-if="categoryEditing === cat.id">
                  <input v-model="editCategoryName" class="inline-input" @keyup.enter="saveCategory(cat)" @keyup.escape="cancelEditCategory" />
                </template>
                <strong v-else>{{ cat.name_ar }}</strong>
              </div>
              <span class="col-num">
                <span class="badge">{{ cat.products_count || 0 }}</span>
              </span>
              <div class="col-actions row-actions">
                <template v-if="categoryEditing === cat.id">
                  <button class="action-btn save" :disabled="categorySaving" @click="saveCategory(cat)">حفظ</button>
                  <button class="action-btn" @click="cancelEditCategory">إلغاء</button>
                </template>
                <template v-else>
                  <button class="action-btn" @click="startEditCategory(cat)">✏️</button>
                  <button class="action-btn danger" :disabled="categorySaving" @click="deleteCategory(cat.id)">🗑️</button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── تاب: وحدات القياس ── -->
      <section v-if="activeTab === 'units'" class="settings-section">
        <div class="section-title">
          <h2>📏 وحدات القياس</h2>
          <p>الوحدات تُستخدم في المنتجات والمشتريات والوصفات</p>
        </div>

        <div class="settings-card">
          <div class="add-row">
            <input
              v-model="newUnit"
              placeholder="مثل: كجم، لتر، قطعة، علبة..."
              class="add-input"
              @keyup.enter="addUnit"
            />
            <button class="btn btn-primary" :disabled="unitSaving || !newUnit.trim()" @click="addUnit">
              {{ unitSaving ? '...' : '+ إضافة' }}
            </button>
          </div>

          <div class="data-table">
            <div class="data-table-head">
              <span>الوحدة</span>
              <span class="col-num">المنتجات</span>
              <span class="col-actions">الإجراءات</span>
            </div>
            <div v-if="!productUnits.length" class="data-table-empty">
              لا توجد وحدات — أضف أول وحدة أعلاه
            </div>
            <div v-for="unit in productUnits" :key="unit.id" class="data-table-row">
              <div class="cell-name">
                <span class="dot accent"></span>
                <template v-if="unitEditing === unit.id">
                  <input v-model="editUnitName" class="inline-input" @keyup.enter="saveUnit(unit)" @keyup.escape="cancelEditUnit" />
                </template>
                <strong v-else>{{ unit.name_ar }}</strong>
              </div>
              <span class="col-num">
                <span class="badge">{{ unit.products_count || 0 }}</span>
              </span>
              <div class="col-actions row-actions">
                <template v-if="unitEditing === unit.id">
                  <button class="action-btn save" :disabled="unitSaving" @click="saveUnit(unit)">حفظ</button>
                  <button class="action-btn" @click="cancelEditUnit">إلغاء</button>
                </template>
                <template v-else>
                  <button class="action-btn" @click="startEditUnit(unit)">✏️</button>
                  <button class="action-btn danger" :disabled="unitSaving" @click="removeUnit(unit)">🗑️</button>
                </template>
              </div>
            </div>
          </div>
          <p class="hint mt-12">💡 حذف وحدة لن يؤثر على المنتجات المرتبطة بها — فقط يزيلها من قائمة الاختيار.</p>
        </div>
      </section>

      <!-- ── تاب: النسخ الاحتياطي ── -->
      <section v-if="activeTab === 'backup'" class="settings-section">
        <div class="section-title">
          <h2>💾 النسخ الاحتياطي</h2>
          <p>أنشئ نسخاً احتياطية واسترد البيانات عند الحاجة</p>
        </div>

        <!-- إحصائيات سريعة -->
        <div class="backup-stats-row">
          <div class="backup-stat-box">
            <span class="stat-num">{{ backups.length }}</span>
            <span class="stat-label">نسخة محفوظة</span>
          </div>
          <div class="backup-stat-box">
            <span class="stat-num">{{ latestBackup ? formatBackupDate(latestBackup.name) : '—' }}</span>
            <span class="stat-label">آخر نسخة</span>
          </div>
          <div class="backup-stat-box">
            <span class="stat-num">{{ formatBackupSize(totalBackupSize) }}</span>
            <span class="stat-label">الحجم الكلي</span>
          </div>
        </div>

        <!-- أدوات -->
        <div class="settings-card">
          <div class="backup-toolbar">
            <div class="toolbar-group">
              <button class="btn btn-primary" @click="createBackup" :disabled="backuping">
                {{ backuping ? 'جاري الإنشاء...' : '+ إنشاء نسخة' }}
              </button>
              <button class="btn btn-outline" @click="refreshBackups">🔄 تحديث</button>
            </div>
            <div class="view-switcher">
              <button :class="{ active: backupView === 'cards' }" @click="backupView = 'cards'">بطاقات</button>
              <button :class="{ active: backupView === 'timeline' }" @click="backupView = 'timeline'">زمني</button>
              <button :class="{ active: backupView === 'compact' }" @click="backupView = 'compact'">مضغوط</button>
            </div>
          </div>

          <!-- قائمة النسخ -->
          <div v-if="sortedBackups.length" class="backup-list" :data-view="backupView">
            <div v-for="b in sortedBackups" :key="b.name" class="backup-item">
              <div class="backup-icon">{{ backupView === 'timeline' ? '●' : 'BK' }}</div>
              <div class="backup-info">
                <strong>{{ b.name }}</strong>
                <small>{{ formatBackupSize(b.size) }} · {{ formatBackupDate(b.name) }}</small>
              </div>
              <div class="backup-item-actions">
                <button class="action-btn" @click="download(b.name)">⬇️ تحميل</button>
                <button class="action-btn save" @click="restore(b.name)">↩️ استرداد</button>
              </div>
            </div>
          </div>
          <div v-else class="backup-empty">
            <strong>لا توجد نسخ احتياطية بعد</strong>
            <p>أنشئ نسخة قبل أي تعديل كبير على البيانات</p>
          </div>
        </div>

        <!-- استرداد من ملف -->
        <div class="settings-card">
          <h4 class="group-label">استرداد من ملف خارجي</h4>
          <p class="section-desc">رفع ملف JSON محفوظ مسبقاً لاستبدال بيانات النظام</p>
          <div class="restore-row">
            <label class="file-picker">
              <input type="file" ref="restoreFileInput" @change="onFileChange" accept="application/json" />
              📂 {{ restoreFile ? restoreFile.name : 'اختر ملف JSON' }}
            </label>
            <button class="btn btn-outline" @click="uploadRestore" :disabled="uploading || !restoreFile">
              {{ uploading ? 'جاري الاسترداد...' : 'رفع واسترداد' }}
            </button>
          </div>
        </div>

        <!-- منطقة الخطر -->
        <div class="settings-card danger-zone">
          <h4 class="group-label danger">⚠️ منطقة الخطر</h4>
          <p class="section-desc">هذه الإجراءات لا يمكن التراجع عنها. تأكد من وجود نسخة احتياطية أولاً.</p>
          <button class="btn btn-danger" @click="clearSystem" :disabled="clearing">
            {{ clearing ? 'جاري التصفير...' : '🗑️ تصفير بيانات النظام' }}
          </button>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import { users as userApi, products as productApi, backup as backupApi } from '@/api';
import { useAppStore, STYLE_PRESETS } from '@/stores/app';
import { CURRENCY } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';

const { loadMeta: refreshMetaCache } = useProductMeta();
const appStore = useAppStore();

// ───── Tabs ─────
const tabs = [
  { id: 'company',    icon: '🏪', label: 'بيانات المحل' },
  { id: 'appearance', icon: '🎨', label: 'المظهر' },
  { id: 'finance',    icon: '💰', label: 'العملة والضريبة' },
  { id: 'categories', icon: '🗂️', label: 'التصنيفات' },
  { id: 'units',      icon: '📏', label: 'وحدات القياس' },
  { id: 'backup',     icon: '💾', label: 'النسخ الاحتياطي' },
];
const activeTab = ref('company');

// ───── Company ─────
const settings = ref({ company: { name_ar: '', phone: '', address: '', tagline: '' }, tax: { enabled: false, rate: 14 } });
const saving = ref(false);
const saveMsg = ref('');

const setMode = (mode) => { appStore.colorMode = mode; appStore.applyTheme(); };

const saveCompany = async () => {
  saving.value = true; saveMsg.value = '';
  try {
    await userApi.updateSetting('company', settings.value.company);
    saveMsg.value = 'تم الحفظ — سيظهر على الفواتير';
    setTimeout(() => saveMsg.value = '', 3000);
  } catch (e) { saveMsg.value = e.message || 'فشل الحفظ'; }
  finally { saving.value = false; }
};

// ───── Categories ─────
const categories = ref([]);
const newCategoryName = ref('');
const categoryEditing = ref(null);
const editCategoryName = ref('');
const categorySaving = ref(false);

const refreshCategories = async () => {
  try { categories.value = (await productApi.categories())?.data || []; await refreshMetaCache(true); }
  catch (_) { categories.value = []; }
};
const addCategory = async () => {
  if (!newCategoryName.value.trim()) return;
  categorySaving.value = true;
  try { await productApi.createCategory({ name_ar: newCategoryName.value.trim() }); newCategoryName.value = ''; await refreshCategories(); }
  catch (e) { alert(e.message || 'فشل إضافة التصنيف'); }
  finally { categorySaving.value = false; }
};
const startEditCategory = (c) => { categoryEditing.value = c.id; editCategoryName.value = c.name_ar; };
const cancelEditCategory = () => { categoryEditing.value = null; editCategoryName.value = ''; };
const saveCategory = async (c) => {
  if (!editCategoryName.value.trim()) { cancelEditCategory(); return; }
  categorySaving.value = true;
  try {
    await productApi.updateCategory(c.id, { name_ar: editCategoryName.value.trim(), slug: editCategoryName.value.trim().replace(/\s+/g, '-') });
    cancelEditCategory(); await refreshCategories();
  } catch (e) { alert(e.message || 'فشل التعديل'); }
  finally { categorySaving.value = false; }
};
const deleteCategory = async (id) => {
  if (!confirm('هل تريد حذف هذا التصنيف؟')) return;
  categorySaving.value = true;
  try { await productApi.deleteCategory(id); await refreshCategories(); }
  catch (e) { alert(e.message || 'فشل الحذف'); }
  finally { categorySaving.value = false; }
};

// ───── Units ─────
const productUnits = ref([]);
const newUnit = ref('');
const unitSaving = ref(false);
const unitEditing = ref(null);
const editUnitName = ref('');

const refreshProductUnits = async () => {
  try { productUnits.value = (await productApi.units())?.data || []; await refreshMetaCache(true); }
  catch (_) { productUnits.value = []; }
};
const addUnit = async () => {
  if (!newUnit.value.trim()) return;
  unitSaving.value = true;
  try { await productApi.createUnit({ name_ar: newUnit.value.trim() }); newUnit.value = ''; await refreshProductUnits(); }
  catch (e) { alert(e.message || 'فشل إضافة الوحدة'); }
  finally { unitSaving.value = false; }
};
const startEditUnit = (u) => { unitEditing.value = u.id; editUnitName.value = u.name_ar; };
const cancelEditUnit = () => { unitEditing.value = null; editUnitName.value = ''; };
const saveUnit = async (u) => {
  if (!editUnitName.value.trim() || editUnitName.value === u.name_ar) { cancelEditUnit(); return; }
  unitSaving.value = true;
  try { await productApi.updateUnit(u.id, { name_ar: editUnitName.value.trim() }); cancelEditUnit(); await refreshProductUnits(); }
  catch (e) { alert(e.message || 'فشل التعديل'); }
  finally { unitSaving.value = false; }
};
const removeUnit = async (u) => {
  if (!confirm(`هل تريد حذف وحدة "${u.name_ar}"؟`)) return;
  unitSaving.value = true;
  try { await productApi.deleteUnit(u.id); await refreshProductUnits(); }
  catch (e) { alert(e.message || 'فشل الحذف'); }
  finally { unitSaving.value = false; }
};

// ───── Backup ─────
const backups = ref([]);
const backupView = ref('cards');
const backuping = ref(false);
const clearing = ref(false);
const uploading = ref(false);
const restoreFile = ref(null);

const sortedBackups = computed(() => [...backups.value].sort((a, b) => String(b.name).localeCompare(String(a.name))));
const latestBackup = computed(() => sortedBackups.value[0] || null);
const totalBackupSize = computed(() => backups.value.reduce((s, b) => s + Number(b.size || 0), 0));

const formatBackupSize = (bytes = 0) => {
  const v = Number(bytes || 0);
  return v >= 1024 * 1024 ? `${(v / 1024 / 1024).toFixed(1)} MB` : `${(v / 1024).toFixed(1)} KB`;
};
const formatBackupDate = (name = '') => {
  const m = String(name).match(/(\d{4})[-_](\d{2})[-_](\d{2})[T_ -](\d{2})[-_:](\d{2})/);
  if (!m) return 'غير محدد';
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
};

const refreshBackups = async () => {
  try { backups.value = (await backupApi.list())?.data || []; } catch (_) { backups.value = []; }
};
const createBackup = async () => {
  backuping.value = true;
  try { await backupApi.create(); await refreshBackups(); alert('تم إنشاء النسخة الاحتياطية'); }
  catch (e) { alert(e.message || 'فشل إنشاء النسخة'); }
  finally { backuping.value = false; }
};
const download = async (name) => {
  try {
    const res = await backupApi.download(name);
    const url = URL.createObjectURL(res);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { alert(e.message || 'فشل التحميل'); }
};
const restore = async (name) => {
  if (!confirm('استرداد نسخة سيستبدل بيانات النظام. استمر؟')) return;
  try { await backupApi.restore(name); alert('تم الاسترداد بنجاح'); }
  catch (e) { alert(e.message || 'فشل الاسترداد'); }
};
const clearSystem = async () => {
  const token = prompt('اكتب CONFIRM_CLEAR للتأكيد — هذا الإجراء لا يمكن التراجع عنه');
  if (token !== 'CONFIRM_CLEAR') return;
  clearing.value = true;
  try { await backupApi.clear({ confirm: 'CONFIRM_CLEAR' }); alert('تم تصفير النظام'); }
  catch (e) { alert(e.message || 'فشل التصفير'); }
  finally { clearing.value = false; }
};
const onFileChange = (e) => { restoreFile.value = e.target.files?.[0] || null; };
const uploadRestore = async () => {
  if (!restoreFile.value) return;
  if (!confirm('استرداد من ملف سيستبدل بيانات النظام. استمر؟')) return;
  uploading.value = true;
  try { await backupApi.restoreFile(restoreFile.value); alert('تم الاسترداد من الملف'); await refreshBackups(); }
  catch (e) { alert(e.message || 'فشل الاسترداد'); }
  finally { uploading.value = false; }
};

// ───── Init ─────
onMounted(async () => {
  try {
    const res = await userApi.settings();
    const data = res?.data || {};
    settings.value.company = data.company || { name_ar: 'بن العجوز', phone: '', address: '', tagline: 'للبن التركي' };
    settings.value.tax = data.tax || { enabled: false, rate: 14 };
  } catch (_) { /* offline */ }
  await Promise.all([refreshCategories(), refreshProductUnits(), refreshBackups()]);
});
</script>

<style lang="scss" scoped>
/* ── Layout ── */
.settings-page {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 24px;
  align-items: start;
  min-height: calc(100vh - 80px);
}

/* ── Sidebar Nav ── */
.settings-nav {
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 16px);
  padding: 10px;
  box-shadow: var(--shadow-sm);
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--radius-md, 10px);
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: right;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 600;
  transition: var(--transition, 0.2s);
  width: 100%;

  &:hover {
    background: color-mix(in srgb, var(--primary) 8%, var(--bg));
    color: var(--text-strong);
  }

  &.active {
    background: color-mix(in srgb, var(--primary) 12%, var(--bg));
    color: var(--primary-dark);
    box-shadow: inset 3px 0 0 var(--primary);
  }

  .nav-icon { font-size: 1.1rem; flex-shrink: 0; }
  .nav-label { flex: 1; }
}

/* ── Content ── */
.settings-content {
  min-width: 0;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  h2 { margin: 0 0 4px; font-size: 1.3rem; color: var(--text-strong); }
  p  { margin: 0; color: var(--text-muted); font-size: 0.9rem; }
}

/* ── Settings Card ── */
.settings-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 16px);
  padding: 22px 24px;
  box-shadow: var(--shadow-sm);

  &.danger-zone {
    border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
    background: color-mix(in srgb, var(--danger) 3%, var(--bg-card));
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);

  strong { display: block; font-size: 1rem; color: var(--text-strong); }
  span   { font-size: 0.82rem; color: var(--text-muted); }
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

/* ── Form Fields ── */
.fields-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  .full-width { grid-column: 1 / -1; }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label { font-size: 0.85rem; font-weight: 700; color: var(--text-strong); }
  input { padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md, 10px); background: var(--bg-elevated); color: var(--text-strong); font-size: 0.9rem; transition: var(--transition); }
  input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent); }

  &.disabled input { opacity: 0.5; cursor: not-allowed; }
  .field-hint { font-size: 0.78rem; color: var(--text-muted); }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-strong);
  input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--primary); }
}

/* ── Info rows ── */
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  &:last-of-type { border-bottom: none; }
}
.info-label { color: var(--text-muted); font-size: 0.88rem; }
.info-value  { font-weight: 700; color: var(--text-strong); font-size: 0.9rem; }
.divider { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

/* ── Group label ── */
.group-label {
  margin: 0 0 14px;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-strong);
  &.danger { color: var(--danger); }
}

/* ── Appearance ── */
.mode-row {
  display: flex;
  gap: 10px;
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md, 10px);
  background: var(--bg-elevated);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-muted);
  transition: var(--transition);

  &:hover { border-color: var(--primary); color: var(--text-strong); }
  &.active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated));
    color: var(--primary-dark);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  }
}

.style-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  margin-top: 4px;
}

.style-card {
  padding: 16px 10px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md, 10px);
  background: var(--bg-elevated);
  cursor: pointer;
  text-align: center;
  transition: var(--transition);

  &:hover { transform: translateY(-2px); box-shadow: var(--shadow-sm); }
  .style-icon { font-size: 1.8rem; display: block; margin-bottom: 6px; }
  strong { display: block; font-size: 0.88rem; color: var(--text-strong); }
  small  { color: var(--text-muted); font-size: 0.72rem; }

  &.active {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
    background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated));
  }
}

/* ── Data Table ── */
.data-table {
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  overflow: hidden;
}

.data-table-head {
  display: grid;
  grid-template-columns: 1fr 80px 120px;
  padding: 10px 14px;
  background: var(--bg);
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.data-table-row {
  display: grid;
  grid-template-columns: 1fr 80px 120px;
  align-items: center;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  transition: background 0.15s;

  &:hover { background: color-mix(in srgb, var(--primary) 3%, transparent); }
}

.data-table-empty {
  padding: 20px 14px;
  color: var(--text-muted);
  font-size: 0.88rem;
  text-align: center;
}

.cell-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  &.primary { background: var(--primary); }
  &.accent  { background: var(--accent, var(--primary)); border-radius: 3px; }
}

.col-num    { text-align: center; }
.col-actions { text-align: end; }
.row-actions { display: flex; gap: 6px; justify-content: flex-end; }

.badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 22px; padding: 0 7px;
  border-radius: 20px; font-size: 0.75rem; font-weight: 800;
  background: color-mix(in srgb, var(--primary) 12%, var(--bg));
  color: var(--primary-dark);
}

.inline-input {
  padding: 6px 10px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--bg-elevated);
  font-size: 0.88rem;
  width: 100%;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
}

/* ── Action Buttons ── */
.action-btn {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-strong);
  font-size: 0.78rem;
  font-weight: 700;
  transition: var(--transition);

  &:hover { border-color: var(--primary); color: var(--primary-dark); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &.save   { color: var(--success, #22c55e); border-color: color-mix(in srgb, var(--success, #22c55e) 40%, var(--border)); }
  &.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); &:hover { background: color-mix(in srgb, var(--danger) 8%, var(--bg-elevated)); } }
}

/* ── Add Row ── */
.add-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  .add-input { flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md, 10px); background: var(--bg-elevated); font-size: 0.9rem; }
  .add-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent); }
}

/* ── Backup ── */
.backup-stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.backup-stat-box {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 16px;
  text-align: center;

  .stat-num   { display: block; font-size: 1.2rem; font-weight: 900; color: var(--text-strong); margin-bottom: 4px; }
  .stat-label { font-size: 0.78rem; color: var(--text-muted); }
}

.backup-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.toolbar-group { display: flex; gap: 8px; }

.view-switcher {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px solid var(--border);

  button {
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.78rem;
    transition: var(--transition);

    &.active { background: var(--bg-elevated); color: var(--primary-dark); box-shadow: var(--shadow-sm); }
  }
}

.backup-list {
  display: grid;
  gap: 8px;

  &[data-view='compact'] .backup-icon { display: none; }
  &[data-view='timeline'] .backup-icon {
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--bg-card); border: 2px solid var(--primary); font-size: 0;
  }
}

.backup-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  transition: var(--transition);

  &:hover { border-color: color-mix(in srgb, var(--primary) 40%, var(--border)); background: color-mix(in srgb, var(--primary) 3%, var(--bg-card)); }
}

.backup-icon {
  width: 40px; height: 40px;
  border-radius: 12px;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--primary) 10%, var(--bg));
  color: var(--primary-dark);
  font-size: 0.72rem; font-weight: 900;
}

.backup-info {
  min-width: 0;
  strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88rem; color: var(--text-strong); }
  small  { color: var(--text-muted); font-size: 0.75rem; }
}

.backup-item-actions { display: flex; gap: 6px; }

.backup-empty {
  text-align: center;
  padding: 28px;
  border: 1px dashed color-mix(in srgb, var(--primary) 30%, var(--border));
  border-radius: var(--radius-md, 10px);
  background: color-mix(in srgb, var(--primary) 4%, transparent);

  strong { display: block; color: var(--text-strong); margin-bottom: 6px; }
  p { margin: 0; color: var(--text-muted); font-size: 0.85rem; }
}

.restore-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.file-picker {
  position: relative;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--primary) 35%, var(--border));
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--primary-dark);
  padding: 9px 14px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.82rem;

  input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
}

/* ── Misc ── */
.hint {
  font-size: 0.82rem;
  color: var(--text-muted);
  code { background: var(--bg); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
}
.section-desc { color: var(--text-muted); font-size: 0.88rem; margin-bottom: 14px; }
.save-msg { color: var(--success, #22c55e); font-size: 0.88rem; margin-top: 8px; }
.mt-12 { margin-top: 12px; }

/* ── Responsive ── */
@media (max-width: 768px) {
  .settings-page {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    gap: 2px;
    padding: 8px;

    &::-webkit-scrollbar { display: none; }
  }

  .settings-nav-item {
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    min-width: 72px;
    text-align: center;
    font-size: 0.72rem;

    &.active { box-shadow: inset 0 -3px 0 var(--primary); }
    .nav-icon { font-size: 1.3rem; }
  }

  .fields-grid { grid-template-columns: 1fr; }
  .backup-stats-row { grid-template-columns: repeat(3, 1fr); }
  .card-footer { flex-direction: column; align-items: flex-start; }
}
</style>
