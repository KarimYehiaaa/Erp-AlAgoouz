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
              <div class="info-value">📎 الشعار: استبدل الملف <code>public/logo.png</code></div>
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
            <p v-if="saveMsg" class="save-msg">✓ {{ saveMsg }}</p>
          </div>

          <!-- Live Thermal Receipt Mockup -->
          <div class="receipt-preview-card card">
            <h4 style="margin-bottom: 12px; font-weight: 700; color: var(--text-muted)">
              📋 معاينة الفاتورة الحرارية المطبوعة
            </h4>
            <div class="thermal-receipt">
              <div class="receipt-header">
                <h3>{{ settings.company.name_ar || 'اسم المحل' }}</h3>
                <p class="tagline">{{ settings.company.tagline || 'شعار المحل يظهر هنا' }}</p>
                <p v-if="settings.company.address" class="meta-line">
                  📍 {{ settings.company.address }}
                </p>
                <p v-if="settings.company.phone" class="meta-line">
                  📞 {{ settings.company.phone }}
                </p>
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
              :disabled="!canEdit"
            />
            <button
              class="btn btn-add"
              :disabled="categorySaving || !newCategoryName.trim() || !canEdit"
              @click="addCategory"
            >
              <AppIcon name="add" :size="16" /> إضافة
            </button>
          </div>

          <div class="data-table">
            <div class="data-table-head">
              <span>التصنيف</span>
              <span class="col-num">المنتجات</span>
              <span v-if="canEdit" class="col-actions">الإجراءات</span>
            </div>
            <div v-if="!categories.length" class="data-table-empty">
              لا توجد تصنيفات — أضف أول تصنيف أعلاه
            </div>
            <div v-for="cat in categories" :key="cat.id" class="data-table-row">
              <div class="cell-name">
                <span class="dot primary"></span>
                <template v-if="categoryEditing === cat.id">
                  <input
                    v-model="editCategoryName"
                    class="inline-input"
                    @keyup.enter="saveCategory(cat)"
                    @keyup.escape="cancelEditCategory"
                  />
                </template>
                <strong v-else>{{ cat.name_ar }}</strong>
              </div>
              <span class="col-num">
                <span class="badge">{{ cat.products_count || 0 }}</span>
              </span>
              <div v-if="canEdit" class="col-actions row-actions">
                <template v-if="categoryEditing === cat.id">
                  <button
                    v-permission="'settings.manage'"
                    class="action-btn save"
                    :disabled="categorySaving"
                    @click="saveCategory(cat)"
                  >
                    حفظ
                  </button>
                  <button class="action-btn" @click="cancelEditCategory">إلغاء</button>
                </template>
                <template v-else>
                  <button class="icon-btn edit" @click="startEditCategory(cat)">
                    <AppIcon name="edit" :size="14" />
                  </button>
                  <button
                    v-permission="'settings.manage'"
                    class="icon-btn danger"
                    :disabled="categorySaving"
                    @click="deleteCategory(cat.id)"
                  >
                    <AppIcon name="delete" :size="14" />
                  </button>
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
              :disabled="!canEdit"
            />
            <button
              class="btn btn-add"
              :disabled="unitSaving || !newUnit.trim() || !canEdit"
              @click="addUnit"
            >
              <AppIcon name="add" :size="16" /> إضافة
            </button>
          </div>

          <div class="data-table">
            <div class="data-table-head">
              <span>الوحدة</span>
              <span class="col-num">المنتجات</span>
              <span v-if="canEdit" class="col-actions">الإجراءات</span>
            </div>
            <div v-if="!productUnits.length" class="data-table-empty">
              لا توجد وحدات — أضف أول وحدة أعلاه
            </div>
            <div v-for="unit in productUnits" :key="unit.id" class="data-table-row">
              <div class="cell-name">
                <span class="dot accent"></span>
                <template v-if="unitEditing === unit.id">
                  <input
                    v-model="editUnitName"
                    class="inline-input"
                    @keyup.enter="saveUnit(unit)"
                    @keyup.escape="cancelEditUnit"
                  />
                </template>
                <strong v-else>{{ unit.name_ar }}</strong>
              </div>
              <span class="col-num">
                <span class="badge">{{ unit.products_count || 0 }}</span>
              </span>
              <div v-if="canEdit" class="col-actions row-actions">
                <template v-if="unitEditing === unit.id">
                  <button
                    v-permission="'settings.manage'"
                    class="action-btn save"
                    :disabled="unitSaving"
                    @click="saveUnit(unit)"
                  >
                    حفظ
                  </button>
                  <button class="action-btn" @click="cancelEditUnit">إلغاء</button>
                </template>
                <template v-else>
                  <button class="icon-btn edit" @click="startEditUnit(unit)">
                    <AppIcon name="edit" :size="14" />
                  </button>
                  <button
                    v-permission="'settings.manage'"
                    class="icon-btn danger"
                    :disabled="unitSaving"
                    @click="removeUnit(unit)"
                  >
                    <AppIcon name="delete" :size="14" />
                  </button>
                </template>
              </div>
            </div>
          </div>
          <p class="hint mt-12">
            💡 حذف وحدة لن يؤثر على المنتجات المرتبطة بها — فقط يزيلها من قائمة الاختيار.
          </p>
        </div>
      </section>

      <!-- ── تاب: الصوتيات والمنبهات ── -->
      <section v-if="activeTab === 'sound'" class="settings-section">
        <div class="section-title">
          <h2>🔊 الصوتيات والمنبهات</h2>
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

          <h4 style="margin-bottom: 12px; font-weight: 800">🔔 تجربة واختبار نغمات الصوت:</h4>
          <div style="display: flex; gap: 12px">
            <button
              type="button"
              class="btn btn-outline"
              :disabled="!soundEnabled"
              @click="playTestBeep('success')"
            >
              🔊 نغمة نجاح العملية
            </button>
            <button
              type="button"
              class="btn btn-outline"
              :disabled="!soundEnabled"
              @click="playTestBeep('warning')"
            >
              ⚠️ نغمة التحذير
            </button>
            <button
              type="button"
              class="btn btn-outline"
              :disabled="!soundEnabled"
              @click="playTestBeep('error')"
            >
              🚨 نغمة خطأ
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

      <!-- ── تاب: الاختصارات السريعة ── -->
      <section v-if="activeTab === 'shortcuts'" class="settings-section">
        <div class="section-title">
          <h2>⌨️ لوحة الاختصارات السريعة</h2>
          <p>استخدم الاختصارات للتنقل الفوري وإنجاز المهام في ثوانٍ</p>
        </div>

        <div class="settings-card">
          <div class="form-group full-width">
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px">
              <input type="checkbox" v-model="shortcutsEnabled" />
              <span>تفعيل اختصارات لوحة المفاتيح العامة (Alt + key)</span>
            </label>
          </div>

          <hr class="divider" style="margin: 20px 0" />

          <h4 style="margin-bottom: 16px; font-weight: 800; color: var(--text-strong)">
            📋 دليل الاختصارات المفعلة بالنظام:
          </h4>

          <div style="display: grid; gap: 12px">
            <div
              style="
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: var(--bg-soft);
                border-radius: 8px;
                border: 1px solid var(--border);
              "
            >
              <span>الكاشير والمبيعات السريعة (POS)</span>
              <kbd
                style="
                  background: var(--border-strong);
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-family: monospace;
                  font-weight: bold;
                "
                >Alt + P</kbd
              >
            </div>
            <div
              style="
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: var(--bg-soft);
                border-radius: 8px;
                border: 1px solid var(--border);
              "
            >
              <span>الرجوع للشاشة الرئيسية (Dashboard)</span>
              <kbd
                style="
                  background: var(--border-strong);
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-family: monospace;
                  font-weight: bold;
                "
                >Alt + D</kbd
              >
            </div>
            <div
              style="
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: var(--bg-soft);
                border-radius: 8px;
                border: 1px solid var(--border);
              "
            >
              <span>فتح الفواتير والمدفوعات (Invoices)</span>
              <kbd
                style="
                  background: var(--border-strong);
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-family: monospace;
                  font-weight: bold;
                "
                >Alt + I</kbd
              >
            </div>
            <div
              style="
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: var(--bg-soft);
                border-radius: 8px;
                border: 1px solid var(--border);
              "
            >
              <span>فتح الإعدادات العامة للسيستم (Settings)</span>
              <kbd
                style="
                  background: var(--border-strong);
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-family: monospace;
                  font-weight: bold;
                "
                >Alt + S</kbd
              >
            </div>
            <div
              style="
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: var(--bg-soft);
                border-radius: 8px;
                border: 1px solid var(--border);
              "
            >
              <span>فتح المخازن وحركة المخزون (Inventory)</span>
              <kbd
                style="
                  background: var(--border-strong);
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-family: monospace;
                  font-weight: bold;
                "
                >Alt + M</kbd
              >
            </div>
            <div
              style="
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: var(--bg-soft);
                border-radius: 8px;
                border: 1px solid var(--border);
              "
            >
              <span>التركيز الفوري على حقل البحث بالكاشير</span>
              <kbd
                style="
                  background: var(--border-strong);
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-family: monospace;
                  font-weight: bold;
                "
                >F7</kbd
              >
            </div>
            <div
              style="
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: var(--bg-soft);
                border-radius: 8px;
                border: 1px solid var(--border);
              "
            >
              <span>حفظ الفاتورة الحالية بالكاشير مباشرة</span>
              <kbd
                style="
                  background: var(--border-strong);
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-family: monospace;
                  font-weight: bold;
                "
                >F2</kbd
              >
            </div>
            <div
              style="
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background: var(--bg-soft);
                border-radius: 8px;
                border: 1px solid var(--border);
              "
            >
              <span>إلغاء وإفراغ سلة الكاشير بالكامل</span>
              <kbd
                style="
                  background: var(--border-strong);
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-family: monospace;
                  font-weight: bold;
                "
                >F4</kbd
              >
            </div>
          </div>

          <div
            class="card-footer"
            style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border)"
          >
            <button class="btn btn-save" @click="saveSettingsLocally">
              حفظ إعدادات الاختصارات
            </button>
          </div>
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
            <span class="stat-num">{{
              latestBackup ? formatBackupDate(latestBackup.name) : '—'
            }}</span>
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
              <button
                v-permission="'settings.manage'"
                class="btn btn-add"
                @click="createBackup"
                :disabled="backuping || !canEdit"
              >
                <AppIcon name="add" :size="16" /> إنشاء نسخة
              </button>
              <button class="btn btn-outline" @click="refreshBackups">
                <AppIcon name="theme" :size="16" /> تحديث
              </button>
            </div>
            <div class="view-switcher">
              <button :class="{ active: backupView === 'cards' }" @click="backupView = 'cards'">
                بطاقات
              </button>
              <button
                :class="{ active: backupView === 'timeline' }"
                @click="backupView = 'timeline'"
              >
                زمني
              </button>
              <button :class="{ active: backupView === 'compact' }" @click="backupView = 'compact'">
                مضغوط
              </button>
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
                <button class="btn btn-sm btn-outline" @click="download(b.name)">
                  <AppIcon name="download" :size="14" /> تحميل
                </button>
                <button
                  v-permission="'settings.manage'"
                  v-if="canEdit"
                  class="btn btn-sm btn-edit"
                  @click="restore(b.name)"
                >
                  <AppIcon name="arrowLeft" :size="14" /> استرداد
                </button>
              </div>
            </div>
          </div>
          <div v-else class="backup-empty">
            <strong>لا توجد نسخ احتياطية بعد</strong>
            <p>أنشئ نسخة قبل أي تعديل كبير على البيانات</p>
          </div>
        </div>

        <!-- إعدادات النسخ الاحتياطي السحابي التلقائي -->
        <div class="settings-card cloud-backup-card">
          <h4 class="group-label">🔒 النسخ الاحتياطي السحابي التلقائي</h4>
          <p class="section-desc">
            قم بربط النظام بخدمة سحابية لرفع النسخة الاحتياطية تلقائياً عند إنشائها أو جدولتها
            دورياً.
          </p>

          <div class="fields-grid">
            <div class="form-group full-width">
              <label>المزود السحابي</label>
              <select v-model="cloudBackupSettings.provider" :disabled="!canEdit">
                <option value="none">تعطيل النسخ السحابي</option>
                <option value="gdrive">Google Drive (جوجل درايف)</option>
                <option value="dropbox">Dropbox (دروب بوكس)</option>
                <option value="webhook">Webhook مخصص / Discord Webhook</option>
              </select>
            </div>
          </div>

          <!-- إعدادات Google Drive -->
          <div v-if="cloudBackupSettings.provider === 'gdrive'" class="provider-fields fade-in">
            <div class="fields-grid">
              <div class="form-group full-width">
                <label>نوع الاتصال بـ Google Drive</label>
                <select v-model="cloudBackupSettings.gdrive_auth_type" :disabled="!canEdit">
                  <option value="service_account">
                    حساب خدمة (Service Account) — مناسب للمؤسسات والمساحات المشتركة
                  </option>
                  <option value="oauth">
                    حساب Google شخصي (OAuth2 / Refresh Token) — مناسب للحسابات الشخصية
                  </option>
                </select>
              </div>

              <!-- خيار 1: Service Account -->
              <div
                v-if="cloudBackupSettings.gdrive_auth_type === 'service_account'"
                class="form-group full-width fade-in"
              >
                <label>ملف مفتاح حساب الخدمة (Google Service Account JSON Key)</label>
                <textarea
                  v-model="cloudBackupSettings.gdrive_key"
                  placeholder='{"type": "service_account", "project_id": ...}'
                  rows="5"
                  style="font-family: monospace; font-size: 0.82rem"
                  :disabled="!canEdit"
                ></textarea>
                <p class="hint mt-12">
                  💡 أدخل محتوى ملف المفتاح JSON الخاص بـ Service Account من Google Cloud Console،
                  وتأكد من مشاركة مجلد الـ Google Drive مع بريد حساب الخدمة.
                </p>
              </div>

              <!-- خيار 2: OAuth2 -->
              <div
                v-if="cloudBackupSettings.gdrive_auth_type === 'oauth'"
                class="form-group full-width fade-in"
              >
                <div class="fields-grid">
                  <div class="form-group">
                    <label>معرف العميل (Client ID)</label>
                    <input
                      type="text"
                      v-model="cloudBackupSettings.gdrive_client_id"
                      placeholder="أدخل Google Client ID"
                      :disabled="!canEdit"
                    />
                  </div>
                  <div class="form-group">
                    <label>مفتاح العميل السري (Client Secret)</label>
                    <input
                      type="password"
                      v-model="cloudBackupSettings.gdrive_client_secret"
                      placeholder="أدخل Google Client Secret"
                      :disabled="!canEdit"
                    />
                  </div>
                  <div class="form-group full-width">
                    <label>رمز التجديد (Refresh Token)</label>
                    <input
                      type="password"
                      v-model="cloudBackupSettings.gdrive_refresh_token"
                      placeholder="أدخل Google OAuth2 Refresh Token"
                      :disabled="!canEdit"
                    />
                    <p class="hint mt-12">
                      💡 يمكنك استخراج رمز التجديد (Refresh Token) بسهولة باستخدام أداة Google OAuth
                      Playground.
                    </p>
                  </div>
                </div>
              </div>

              <div class="form-group full-width">
                <label>معرف مجلد جوجل درايف (Google Drive Folder ID)</label>
                <input
                  type="text"
                  v-model="cloudBackupSettings.gdrive_folder_id"
                  placeholder="أدخل Folder ID (اختياري)"
                  :disabled="!canEdit"
                />
                <p class="hint">
                  💡 إذا تركته فارغاً سيتم رفع الملف في المجلد الرئيسي لحساب جوجل درايف الخاص بك.
                </p>
              </div>
            </div>
          </div>

          <!-- إعدادات Dropbox -->
          <div v-if="cloudBackupSettings.provider === 'dropbox'" class="provider-fields fade-in">
            <div class="fields-grid">
              <div class="form-group full-width">
                <label>رمز الوصول (Access Token)</label>
                <input
                  type="password"
                  v-model="cloudBackupSettings.dropbox_token"
                  placeholder="أدخل Dropbox Access Token"
                  :disabled="!canEdit"
                />
              </div>
              <div class="form-group full-width">
                <label>مسار المجلد السحابي</label>
                <input
                  type="text"
                  v-model="cloudBackupSettings.dropbox_path"
                  placeholder="/AlAgoouz-ERP-Backups"
                  :disabled="!canEdit"
                />
              </div>
            </div>
          </div>

          <!-- إعدادات Webhook -->
          <div v-if="cloudBackupSettings.provider === 'webhook'" class="provider-fields fade-in">
            <div class="fields-grid">
              <div class="form-group full-width">
                <label>رابط الـ Webhook</label>
                <input
                  type="text"
                  v-model="cloudBackupSettings.webhook_url"
                  placeholder="https://discord.com/api/webhooks/..."
                  :disabled="!canEdit"
                />
                <p class="hint mt-12">
                  💡 يدعم روابط Webhooks الخاصة بـ Discord بشكل مباشر مع تفاصيل محسنة.
                </p>
              </div>
            </div>
          </div>

          <div class="cloud-actions">
            <button
              v-permission="'settings.manage'"
              v-if="canEdit"
              class="btn btn-save"
              @click="saveCloudBackupSettings"
              :disabled="cloudSaving"
            >
              <AppIcon name="save" :size="16" />
              {{ cloudSaving ? 'جاري الحفظ...' : 'حفظ الإعدادات السحابية' }}
            </button>
            <button
              v-if="cloudBackupSettings.provider !== 'none'"
              class="btn btn-outline"
              @click="testCloudBackup"
              :disabled="cloudTesting || !canEdit"
            >
              <AppIcon name="theme" :size="16" />
              {{ cloudTesting ? 'جاري الفحص...' : 'فحص الرفع التجريبي' }}
            </button>
          </div>
        </div>

        <!-- استرداد من ملف -->
        <div v-if="canEdit" class="settings-card">
          <h4 class="group-label">استرداد من ملف خارجي</h4>
          <p class="section-desc">رفع ملف JSON محفوظ مسبقاً لاستبدال بيانات النظام</p>
          <div class="restore-row">
            <label class="file-picker">
              <input
                type="file"
                ref="restoreFileInput"
                @change="onFileChange"
                accept="application/json"
              />
              📂 {{ restoreFile ? restoreFile.name : 'اختر ملف JSON' }}
            </label>
            <button
              class="btn btn-outline"
              @click="uploadRestore"
              :disabled="uploading || !restoreFile"
            >
              <AppIcon name="download" :size="16" style="transform: rotate(180deg)" />
              {{ uploading ? 'جاري الاسترداد...' : 'رفع واسترداد' }}
            </button>
          </div>
        </div>

        <!-- منطقة الخطر -->
        <div v-if="canEdit" class="settings-card danger-zone">
          <h4 class="group-label danger">⚠️ منطقة الخطر</h4>
          <p class="section-desc">
            هذه الإجراءات لا يمكن التراجع عنها. تأكد من وجود نسخة احتياطية أولاً.
          </p>
          <button class="btn btn-delete" @click="clearSystem" :disabled="clearing">
            <AppIcon name="delete" :size="16" />
            {{ clearing ? 'جاري التصفير...' : 'تصفير بيانات النظام' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import { users as userApi, products as productApi, backup as backupApi } from '@/api';
import { useAppStore } from '@/stores/app';
import { CURRENCY } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';

import { useAuthStore } from '@/stores/auth';

const { loadMeta: refreshMetaCache } = useProductMeta();
const appStore = useAppStore();
const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasPermission('settings.manage'));

// ───── Tabs ─────
const tabs = [
  { id: 'company', icon: '🏪', label: 'بيانات المحل' },
  { id: 'categories', icon: '🗂️', label: 'التصنيفات' },
  { id: 'units', icon: '📏', label: 'وحدات القياس' },
  { id: 'sound', icon: '🔊', label: 'الصوتيات والمنبهات' },
  { id: 'shortcuts', icon: '⌨️', label: 'الاختصارات السريعة' },
  { id: 'backup', icon: '💾', label: 'النسخ الاحتياطي' },
];
const activeTab = ref('company');

// ───── Audio & Shortcuts settings ─────
const soundEnabled = ref(localStorage.getItem('sound_enabled') !== 'false');
const soundVolume = ref(parseFloat(localStorage.getItem('sound_volume') || '0.08'));
const shortcutsEnabled = ref(localStorage.getItem('shortcuts_enabled') !== 'false');

const saveSettingsLocally = () => {
  localStorage.setItem('sound_enabled', String(soundEnabled.value));
  localStorage.setItem('sound_volume', String(soundVolume.value));
  localStorage.setItem('shortcuts_enabled', String(shortcutsEnabled.value));
  alert('✓ تم حفظ إعدادات النظام بنجاح!');
};

const playTestBeep = (type: any) => {
  try {
    const AudioCtx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    if (type === 'success') {
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime);
      gain.gain.setValueAtTime(soundVolume.value, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 0.25);
      osc2.stop(audioCtx.currentTime + 0.25);
    } else if (type === 'warning') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      gain.gain.setValueAtTime(soundVolume.value * 1.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'error') {
      const gain = audioCtx.createGain();
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(soundVolume.value * 2, audioCtx.currentTime);
      const playTone = (freq: any, duration: any, delay: any) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        osc.connect(gain);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
      };
      playTone(130, 0.1, 0);
      playTone(130, 0.1, 0.12);
      playTone(130, 0.15, 0.24);
    }
  } catch (err: any) {
    console.error('Audio play failed:', err);
  }
};

// ───── Company ─────
const settings = ref({
  company: { name_ar: '', phone: '', address: '', tagline: '' },
  tax: { enabled: false, rate: 14 },
});
const saving = ref(false);
const saveMsg = ref('');

const saveCompany = async () => {
  saving.value = true;
  saveMsg.value = '';
  try {
    await userApi.updateSetting('company', settings.value.company);
    saveMsg.value = 'تم الحفظ — سيظهر على الفواتير';
    setTimeout(() => (saveMsg.value = ''), 3000);
  } catch (e: any) {
    saveMsg.value = e.message || 'فشل الحفظ';
  } finally {
    saving.value = false;
  }
};

// ───── Categories ─────
const categories = ref<any[]>([]);
const newCategoryName = ref('');
const categoryEditing = ref<any>(null);
const editCategoryName = ref('');
const categorySaving = ref(false);

const refreshCategories = async () => {
  try {
    categories.value = (await productApi.categories())?.data || [];
    await refreshMetaCache(true);
  } catch (_: any) {
    categories.value = [];
  }
};
const addCategory = async () => {
  if (!newCategoryName.value.trim()) return;
  categorySaving.value = true;
  try {
    await productApi.createCategory({ name_ar: newCategoryName.value.trim() });
    newCategoryName.value = '';
    await refreshCategories();
  } catch (e: any) {
    alert(e.message || 'فشل إضافة التصنيف');
  } finally {
    categorySaving.value = false;
  }
};
const startEditCategory = (c: any) => {
  categoryEditing.value = c.id;
  editCategoryName.value = c.name_ar;
};
const cancelEditCategory = () => {
  categoryEditing.value = null;
  editCategoryName.value = '';
};
const saveCategory = async (c: any) => {
  if (!editCategoryName.value.trim()) {
    cancelEditCategory();
    return;
  }
  categorySaving.value = true;
  try {
    await productApi.updateCategory(c.id, {
      name_ar: editCategoryName.value.trim(),
      slug: editCategoryName.value.trim().replace(/\s+/g, '-'),
    });
    cancelEditCategory();
    await refreshCategories();
  } catch (e: any) {
    alert(e.message || 'فشل التعديل');
  } finally {
    categorySaving.value = false;
  }
};
const deleteCategory = async (id: any) => {
  if (!confirm('هل تريد حذف هذا التصنيف؟')) return;
  categorySaving.value = true;
  try {
    await productApi.deleteCategory(id);
    await refreshCategories();
  } catch (e: any) {
    alert(e.message || 'فشل الحذف');
  } finally {
    categorySaving.value = false;
  }
};

// ───── Units ─────
const productUnits = ref<any[]>([]);
const newUnit = ref('');
const unitSaving = ref(false);
const unitEditing = ref<any>(null);
const editUnitName = ref('');

const refreshProductUnits = async () => {
  try {
    productUnits.value = (await productApi.units())?.data || [];
    await refreshMetaCache(true);
  } catch (_: any) {
    productUnits.value = [];
  }
};
const addUnit = async () => {
  if (!newUnit.value.trim()) return;
  unitSaving.value = true;
  try {
    await productApi.createUnit({ name_ar: newUnit.value.trim() });
    newUnit.value = '';
    await refreshProductUnits();
  } catch (e: any) {
    alert(e.message || 'فشل إضافة الوحدة');
  } finally {
    unitSaving.value = false;
  }
};
const startEditUnit = (u: any) => {
  unitEditing.value = u.id;
  editUnitName.value = u.name_ar;
};
const cancelEditUnit = () => {
  unitEditing.value = null;
  editUnitName.value = '';
};
const saveUnit = async (u: any) => {
  if (!editUnitName.value.trim() || editUnitName.value === u.name_ar) {
    cancelEditUnit();
    return;
  }
  unitSaving.value = true;
  try {
    await productApi.updateUnit(u.id, { name_ar: editUnitName.value.trim() });
    cancelEditUnit();
    await refreshProductUnits();
  } catch (e: any) {
    alert(e.message || 'فشل التعديل');
  } finally {
    unitSaving.value = false;
  }
};
const removeUnit = async (u: any) => {
  if (!confirm(`هل تريد حذف وحدة "${u.name_ar}"؟`)) return;
  unitSaving.value = true;
  try {
    await productApi.deleteUnit(u.id);
    await refreshProductUnits();
  } catch (e: any) {
    alert(e.message || 'فشل الحذف');
  } finally {
    unitSaving.value = false;
  }
};

// ───── Backup ─────
const backups = ref<any[]>([]);
const backupView = ref('cards');
const backuping = ref(false);
const clearing = ref(false);
const uploading = ref(false);
const restoreFile = ref<any>(null);

// ───── Cloud Backup ─────
const cloudBackupSettings = ref({
  provider: 'none',
  gdrive_auth_type: 'service_account',
  gdrive_key: '',
  gdrive_folder_id: '',
  gdrive_client_id: '',
  gdrive_client_secret: '',
  gdrive_refresh_token: '',
  dropbox_token: '',
  dropbox_path: '/AlAgoouz-ERP-Backups',
  webhook_url: '',
});
const cloudSaving = ref(false);
const cloudTesting = ref(false);

const saveCloudBackupSettings = async () => {
  cloudSaving.value = true;
  try {
    await userApi.updateSetting('cloud_backup', cloudBackupSettings.value);
    alert('تم حفظ إعدادات النسخ السحابي بنجاح');
  } catch (e: any) {
    alert(e.message || 'فشل حفظ إعدادات النسخ السحابي');
  } finally {
    cloudSaving.value = false;
  }
};

const testCloudBackup = async () => {
  cloudTesting.value = true;
  try {
    const res = (await backupApi.cloudTest(cloudBackupSettings.value)) as any;
    if (res?.data?.success || res?.success) {
      alert('✅ نجح الاتصال والرفع السحابي التجريبي!');
    } else {
      alert(`❌ فشل الرفع التجريبي: ${res?.message || 'خطأ غير معروف'}`);
    }
  } catch (e: any) {
    alert(`❌ فشل الفحص: ${e.response?.data?.message || e.message}`);
  } finally {
    cloudTesting.value = false;
  }
};

const sortedBackups = computed(() =>
  [...backups.value].sort((a: any, b: any) => String(b.name).localeCompare(String(a.name))),
);
const latestBackup = computed(() => sortedBackups.value[0] || null);
const totalBackupSize = computed(() =>
  backups.value.reduce((s: any, b: any) => s + Number(b.size || 0), 0),
);

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
  try {
    backups.value = (await backupApi.list())?.data || [];
  } catch (_: any) {
    backups.value = [];
  }
};
const createBackup = async () => {
  backuping.value = true;
  try {
    await backupApi.create();
    await refreshBackups();
    alert('تم إنشاء النسخة الاحتياطية');
  } catch (e: any) {
    alert(e.message || 'فشل إنشاء النسخة');
  } finally {
    backuping.value = false;
  }
};
const download = async (name: any) => {
  try {
    const res = (await backupApi.download(name)) as unknown as Blob;
    const url = URL.createObjectURL(res);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    alert(e.message || 'فشل التحميل');
  }
};
const restore = async (name: any) => {
  if (!confirm('استرداد نسخة سيستبدل بيانات النظام. استمر؟')) return;
  try {
    await backupApi.restore(name);
    alert('تم الاسترداد بنجاح');
  } catch (e: any) {
    alert(e.message || 'فشل الاسترداد');
  }
};
const clearSystem = async () => {
  const token = prompt('اكتب CONFIRM_CLEAR للتأكيد — هذا الإجراء لا يمكن التراجع عنه');
  if (token !== 'CONFIRM_CLEAR') return;
  clearing.value = true;
  try {
    await backupApi.clear({ confirm: 'CONFIRM_CLEAR' });
    alert('تم تصفير النظام');
  } catch (e: any) {
    alert(e.message || 'فشل التصفير');
  } finally {
    clearing.value = false;
  }
};
const onFileChange = (e: any) => {
  restoreFile.value = e.target.files?.[0] || null;
};
const uploadRestore = async () => {
  if (!restoreFile.value) return;
  if (!confirm('استرداد من ملف سيستبدل بيانات النظام. استمر؟')) return;
  uploading.value = true;
  try {
    await backupApi.restoreFile(restoreFile.value);
    alert('تم الاسترداد من الملف');
    await refreshBackups();
  } catch (e: any) {
    alert(e.message || 'فشل الاسترداد');
  } finally {
    uploading.value = false;
  }
};

// ───── Init ─────
onMounted(async () => {
  try {
    const res = await userApi.settings();
    const data = res?.data || {};
    settings.value.company = data.company || {
      name_ar: 'بن العجوز',
      phone: '',
      address: '',
      tagline: 'للبن التركي',
    };
    settings.value.tax = data.tax || { enabled: false, rate: 14 };
    cloudBackupSettings.value = data.cloud_backup || {
      provider: 'none',
      gdrive_auth_type: 'service_account',
      gdrive_key: '',
      gdrive_folder_id: '',
      gdrive_client_id: '',
      gdrive_client_secret: '',
      gdrive_refresh_token: '',
      dropbox_token: '',
      dropbox_path: '/AlAgoouz-ERP-Backups',
      webhook_url: '',
    };
  } catch (_: any) {
    /* offline */
  }
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

  .nav-icon {
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .nav-label {
    flex: 1;
  }
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
  h2 {
    margin: 0 0 4px;
    font-size: 1.3rem;
    color: var(--text-strong);
  }
  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
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

  strong {
    display: block;
    font-size: 1rem;
    color: var(--text-strong);
  }
  span {
    font-size: 0.82rem;
    color: var(--text-muted);
  }
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

  .full-width {
    grid-column: 1 / -1;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-strong);
  }
  input {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elevated);
    color: var(--text-strong);
    font-size: 0.9rem;
    transition: var(--transition);
  }
  input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  }

  &.disabled input {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .field-hint {
    font-size: 0.78rem;
    color: var(--text-muted);
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-strong);
  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--primary);
  }
}

/* ── Info rows ── */
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  &:last-of-type {
    border-bottom: none;
  }
}
.info-label {
  color: var(--text-muted);
  font-size: 0.88rem;
}
.info-value {
  font-weight: 700;
  color: var(--text-strong);
  font-size: 0.9rem;
}
.divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 16px 0;
}

/* ── Group label ── */
.group-label {
  margin: 0 0 14px;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-strong);
  &.danger {
    color: var(--danger);
  }
}

/* ── Appearance ── */
.mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.mode-btn {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 16px;
  border: none;
  border-radius: 20px;
  background: var(--bg-card);
  box-shadow:
    0 4px 15px rgba(0, 0, 0, 0.05),
    inset 0 0 0 1px var(--border);
  cursor: pointer;
  font-weight: 800;
  font-size: 1.1rem;
  color: var(--text-muted);
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  z-index: 1;

  span {
    font-size: 2.2rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
    transition: transform 0.3s ease;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 12px 24px rgba(0, 0, 0, 0.08),
      inset 0 0 0 1px color-mix(in srgb, var(--primary) 40%, var(--border));
    color: var(--text-strong);
    span {
      transform: scale(1.1);
    }
  }

  &.active {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: #fff;
    box-shadow: 0 8px 25px color-mix(in srgb, var(--primary) 40%, transparent);
    span {
      transform: scale(1.15);
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
    }
  }
}

.style-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.style-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  min-height: 48px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-card);
  cursor: pointer;
  text-align: right;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .theme-swatch {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
    transition: transform 0.25s ease;
  }

  .theme-name {
    font-size: 0.88rem;
    font-weight: 750;
    color: var(--text-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &.active {
    background: var(--bg-elevated);
    border-color: var(--primary);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--primary) 22%, transparent);
    outline: 2.5px solid var(--primary);
    outline-offset: -2.5px;

    .theme-swatch {
      transform: scale(1.1);
      box-shadow:
        0 0 0 2px var(--bg-card),
        inset 0 0 0 1px rgba(0, 0, 0, 0.25);
    }

    .theme-name {
      color: var(--primary);
      font-weight: 850;
    }
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

  &:hover {
    background: color-mix(in srgb, var(--primary) 3%, transparent);
  }
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
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  &.primary {
    background: var(--primary);
  }
  &.accent {
    background: var(--accent, var(--primary));
    border-radius: 3px;
  }
}

.col-num {
  text-align: center;
}
.col-actions {
  text-align: end;
}
.row-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 22px;
  padding: 0 7px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 800;
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

  &:hover {
    border-color: var(--primary);
    color: var(--primary-dark);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  &.save {
    color: var(--success, #22c55e);
    border-color: color-mix(in srgb, var(--success, #22c55e) 40%, var(--border));
  }
  &.danger {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
    &:hover {
      background: color-mix(in srgb, var(--danger) 8%, var(--bg-elevated));
    }
  }
}

/* ── Add Row ── */
.add-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  .add-input {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elevated);
    font-size: 0.9rem;
  }
  .add-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  }
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

  .stat-num {
    display: block;
    font-size: 1.2rem;
    font-weight: 900;
    color: var(--text-strong);
    margin-bottom: 4px;
  }
  .stat-label {
    font-size: 0.78rem;
    color: var(--text-muted);
  }
}

.backup-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  gap: 8px;
}

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

    &.active {
      background: var(--bg-elevated);
      color: var(--primary-dark);
      box-shadow: var(--shadow-sm);
    }
  }
}

.backup-list {
  display: grid;
  gap: 8px;

  &[data-view='compact'] .backup-icon {
    display: none;
  }
  &[data-view='timeline'] .backup-icon {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--bg-card);
    border: 2px solid var(--primary);
    font-size: 0;
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

  &:hover {
    border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
    background: color-mix(in srgb, var(--primary) 3%, var(--bg-card));
  }
}

.backup-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--primary) 10%, var(--bg));
  color: var(--primary-dark);
  font-size: 0.72rem;
  font-weight: 900;
}

.backup-info {
  min-width: 0;
  strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.88rem;
    color: var(--text-strong);
  }
  small {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
}

.backup-item-actions {
  display: flex;
  gap: 6px;
}

.backup-empty {
  text-align: center;
  padding: 28px;
  border: 1px dashed color-mix(in srgb, var(--primary) 30%, var(--border));
  border-radius: var(--radius-md, 10px);
  background: color-mix(in srgb, var(--primary) 4%, transparent);

  strong {
    display: block;
    color: var(--text-strong);
    margin-bottom: 6px;
  }
  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
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

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}

/* ── Misc ── */
.hint {
  font-size: 0.82rem;
  color: var(--text-muted);
  code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
  }
}
.section-desc {
  color: var(--text-muted);
  font-size: 0.88rem;
  margin-bottom: 14px;
}
.save-msg {
  color: var(--success, #22c55e);
  font-size: 0.88rem;
  margin-top: 8px;
}
.mt-12 {
  margin-top: 12px;
}

/* ── Cloud Backup ── */
.cloud-backup-card {
  margin-top: 16px;

  select {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elevated);
    color: var(--text-strong);
    font-size: 0.9rem;
    transition: var(--transition);
    cursor: pointer;
    width: 100%;

    &:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }
  }

  textarea {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elevated);
    color: var(--text-strong);
    font-size: 0.9rem;
    transition: var(--transition);
    width: 100%;
    resize: vertical;

    &:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }
  }

  .cloud-actions {
    display: flex;
    gap: 12px;
    margin-top: 20px;
  }

  .provider-fields {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

.receipt-preview-card {
  background: var(--bg-soft);
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}
.thermal-receipt {
  background: #fff;
  color: #000;
  padding: 20px;
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-md);
  font-family: 'Cairo', sans-serif;
  max-width: 320px;
  margin: 0 auto;
  box-sizing: border-box;
  text-align: right;

  .receipt-header {
    text-align: center;
    margin-bottom: 12px;
    h3 {
      font-size: 1.15rem;
      font-weight: 800;
      margin: 0 0 4px 0;
      color: #000;
    }
    .tagline {
      font-size: 0.8rem;
      font-style: italic;
      color: #555;
      margin: 0 0 6px 0;
    }
    .meta-line {
      font-size: 0.72rem;
      color: #666;
      margin: 2px 0;
    }
  }

  .divider-dotted {
    border-top: 1.5px dotted #333;
    margin: 8px 0;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #444;
    margin: 3px 0;
    direction: rtl;
  }

  .items-list {
    margin: 8px 0;
    direction: rtl;
    .item-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #333;
      margin: 4px 0;
      &.header {
        font-weight: 800;
        color: #000;
        margin-bottom: 6px;
      }
    }
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    font-weight: 900;
    color: #000;
    margin-top: 6px;
    direction: rtl;
  }

  .receipt-footer {
    text-align: center;
    font-size: 0.72rem;
    color: #555;
    margin-top: 8px;
    p {
      margin: 0;
    }
  }
}

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

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .settings-nav-item {
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    min-width: 72px;
    text-align: center;
    font-size: 0.72rem;

    &.active {
      box-shadow: inset 0 -3px 0 var(--primary);
    }
    .nav-icon {
      font-size: 1.3rem;
    }
  }

  .fields-grid {
    grid-template-columns: 1fr;
  }
  .backup-stats-row {
    grid-template-columns: repeat(3, 1fr);
  }
  .card-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
