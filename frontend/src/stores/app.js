import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const STYLE_PRESETS = [
  { id: 'modern', name: 'المريمية الهادئة', icon: 'theme', desc: 'أخضر هادئ وناعم للتشغيل اليومي' },
  { id: 'royal', name: 'الأزرق الملكي', icon: 'reports', desc: 'كحلي إداري مع لمسة ذهبية' },
  { id: 'roastery', name: 'استوديو التحميص', icon: 'coffee', desc: 'قهوة دافئة بطابع محمصة عصري' },
  { id: 'terminal', name: 'شاشة الأرقام', icon: 'inventory', desc: 'داشبورد داكن للتركيز على الأرقام' },
  { id: 'twilight', name: 'أوركيد الشفق', icon: 'theme', desc: 'ليلي ملوكي يدمج البنفسجي والذهبي المشرق' },
  { id: 'vintage', name: 'أنتيكة القاهرة', icon: 'coffee', desc: 'تراثي فخم بتفاصيل النحاس والجلد العتيق' },
  { id: 'matcha', name: 'القهوة والماتشا', icon: 'theme', desc: 'دمج هادئ بين أخضر الماتشا ورغوة الحليب' },
  { id: 'terracotta', name: 'الفخار والكتان', icon: 'theme', desc: 'طابع طيني ترابي دافئ مع نعومة الكتان' },
  { id: 'glacier', name: 'ثلج النعناع', icon: 'theme', desc: 'منعش ومضيء يدمج الفيروزي البارد وأخضر النعناع' },
  { id: 'cocoa', name: 'الشوكولاتة الليلية', icon: 'theme', desc: 'داكن عميق ولذيذ بلون الكاكاو مع النحاس اللامع' },
  { id: 'merlot', name: 'كرز الخريف والنحاس', icon: 'theme', desc: 'عنابي كرزي غامق مع لمسات النحاس الأصفر الملكي' },
  { id: 'sahara', name: 'ذهب الصحراء', icon: 'theme', desc: 'هدوء وأناقة رمال الصحراء الذهبية وقت الغروب' },
  { id: 'macchiato', name: 'كراميل ماكياتو', icon: 'coffee', desc: 'تدرجات الكراميل الذهبي ورغوة الحليب الدافئة' },
  { id: 'pistachio', name: 'الفستق والورد', icon: 'theme', desc: 'تناغم مريح بين أخضر الفستق والوردي الناعم' },
  { id: 'goldcharcoal', name: 'الفحم الذهبي', icon: 'theme', desc: 'فخامة الفحم الداكن مع لمعان الذهب الملكي' },
  { id: 'cyberpunk', name: 'سايبربانك نيون', icon: 'theme', desc: 'مستقبلي جريء يدمج الفوشيا النيون والأزرق المضيء' },
  { id: 'nebula', name: 'سديم الفضاء', icon: 'theme', desc: 'غموض الفضاء بلون البنفسجي الكوني والزمرد المتوهج' },
  { id: 'retroarcade', name: 'ألعاب الطيبين', icon: 'theme', desc: 'طابع الثمانينات المبهج بلون الروز الدافئ والفسفوري' },
  { id: 'techslate', name: 'الفحم التقني (Linear)', icon: 'theme', desc: 'فخامة الفحم الداكن والخطوط الدقيقة بتوهج أزرق' },
  { id: 'aurora', name: 'أورورا التقنية (Stripe)', icon: 'theme', desc: 'تدرجات الشفق الانسيابي بلون النيل المضيء والزمرد' },
  { id: 'nordic', name: 'الصقيع الاسكندنافي (Nord)', icon: 'theme', desc: 'ألوان قطبية هادئة مريحة لأعين المطورين والتشغيل' },
  { id: 'hologram', name: 'الهولوجرام الساحر', icon: 'theme', desc: 'مزيج ألوان الطيف النيون اللامع تحت زجاج بلوري مصنفر' },
  { id: 'acidneon', name: 'الفسفوري المجنون', icon: 'theme', desc: 'حيوية قصوى تجمع الليموني المشع والوردي النيون والأزرق الليزري' },
  { id: 'sunset', name: 'غروب المهرجان', icon: 'theme', desc: 'ألوان دافئة متفجرة بلون البرتقالي والبنفسجي والأرجواني' },
  { id: 'miami', name: 'ميامي فيس', icon: 'theme', desc: 'مزيج صيفي نابض بين الفيروزي والوردي الحار والأصفر المشمس' },
  { id: 'volcano', name: 'الحمم البركانية', icon: 'theme', desc: 'تدفق الحمم البركانية النارية بين درجات البرتقالي والأحمر والأصفر' },
  { id: 'toxic', name: 'الإشعاع الفسفوري', icon: 'theme', desc: 'راديو أكتيف ليموني مشع مع بنفسجي سام وسيان ليزري' },
  { id: 'chromashift', name: 'الزجاج الحركي المشع (ChromaShift)', icon: 'theme', desc: 'تخطيط عضوي متحرك وزجاج مصنفر فوق شفق قطبي خماسي الألوان' },
  { id: 'prismatic', name: 'المنشور الطيفي (Prismatic)', icon: 'theme', desc: 'ثيم سياقي متغير بدون لون رئيسي مهيمن - يتغير لونه حسب كل صفحة وقسم' }
];

export const STYLE_SWATCHES = {
  modern: 'linear-gradient(135deg, #126453, #c77a2f)',
  royal: 'linear-gradient(135deg, #1e3a8a, #d97706)',
  roastery: 'linear-gradient(135deg, #4a2c11, #c2410c)',
  terminal: 'linear-gradient(135deg, #090d0b, #10b981)',
  twilight: 'linear-gradient(135deg, #0f051d, #fbbf24)',
  vintage: 'linear-gradient(135deg, #3e2723, #8d6e63)',
  matcha: 'linear-gradient(135deg, #5a785d, #eae2cc)',
  terracotta: 'linear-gradient(135deg, #c86b45, #eae4d9)',
  glacier: 'linear-gradient(135deg, #4fa3a5, #dbeef0)',
  cocoa: 'linear-gradient(135deg, #1c130e, #cd7f32)',
  merlot: 'linear-gradient(135deg, #722f37, #bda55d)',
  sahara: 'linear-gradient(135deg, #cfa13a, #eae2d1)',
  macchiato: 'linear-gradient(135deg, #d97706, #78350f)',
  pistachio: 'linear-gradient(135deg, #a7f3d0, #fda4af)',
  goldcharcoal: 'linear-gradient(135deg, #18181b, #ca8a04)',
  cyberpunk: 'linear-gradient(135deg, #ff007f, #00f0ff)',
  nebula: 'linear-gradient(135deg, #8b5cf6, #10b981)',
  retroarcade: 'linear-gradient(135deg, #f43f5e, #06b6d4)',
  techslate: 'linear-gradient(135deg, #0f0f11, #3b82f6)',
  aurora: 'linear-gradient(135deg, #6366f1, #2dd4bf)',
  nordic: 'linear-gradient(135deg, #2e3440, #88c0d0)',
  hologram: 'linear-gradient(135deg, #ff007f, #a3e635)',
  acidneon: 'linear-gradient(135deg, #a3e635, #00f0ff)',
  sunset: 'linear-gradient(135deg, #f97316, #d946ef)',
  miami: 'linear-gradient(135deg, #06b6d4, #ec4899)',
  volcano: 'linear-gradient(135deg, #ea580c, #ef4444)',
  toxic: 'linear-gradient(135deg, #a3e635, #581c87)',
  chromashift: 'linear-gradient(135deg, #8b5cf6, #ff007f)',
  prismatic: 'linear-gradient(135deg, #ff007f, #00f0ff, #a3e635)',
};

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(localStorage.getItem('sidebarOpen') !== 'false');
  const colorMode = ref(localStorage.getItem('colorMode') || 'light');
  const savedPreset = localStorage.getItem('stylePreset');
  const stylePreset = ref(STYLE_PRESETS.some((item) => item.id === savedPreset) ? savedPreset : 'roastery');
  const notifications = ref([]);
  const notificationDrawerOpen = ref(false);
  const isOnline = ref(navigator.onLine);
  const pendingSyncCount = ref(0);
  const dataRefreshTrigger = ref(0);

  const triggerDataRefresh = () => {
    dataRefreshTrigger.value++;
  };

  const toggleNotificationDrawer = () => {
    notificationDrawerOpen.value = !notificationDrawerOpen.value;
  };

  const syncSidebarWidth = () => {
    const width = sidebarOpen.value ? '280px' : '76px';
    document.documentElement.style.setProperty('--sidebar-current-width', width);
  };

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value;
    localStorage.setItem('sidebarOpen', String(sidebarOpen.value));
    syncSidebarWidth();
  };

  const toggleColorMode = (event) => {
    const isDark = colorMode.value === 'dark';
    
    if (!document.startViewTransition) {
      colorMode.value = isDark ? 'light' : 'dark';
      applyTheme();
      return;
    }

    const x = event instanceof MouseEvent ? event.clientX : window.innerWidth / 2;
    const y = event instanceof MouseEvent ? event.clientY : window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      colorMode.value = isDark ? 'light' : 'dark';
      applyTheme();
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 400,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: isDark
            ? '::view-transition-old(root)'
            : '::view-transition-new(root)'
        }
      );
    });
  };

  const setStylePreset = (id) => {
    if (!STYLE_PRESETS.some((item) => item.id === id)) return;
    stylePreset.value = id;
    applyTheme();
  };

  const applyTheme = () => {
    const root = document.documentElement;
    root.setAttribute('data-theme', colorMode.value);
    root.setAttribute('data-style', stylePreset.value);
    localStorage.setItem('colorMode', colorMode.value);
    localStorage.setItem('stylePreset', stylePreset.value);
    localStorage.setItem('theme', colorMode.value);
    syncSidebarWidth();
  };

  const privacyMode = ref(localStorage.getItem('privacyMode') === 'true');
  
  const togglePrivacyMode = () => {
    privacyMode.value = !privacyMode.value;
    localStorage.setItem('privacyMode', String(privacyMode.value));
    applyPrivacyMode();
  };

  const applyPrivacyMode = () => {
    if (privacyMode.value) {
      document.documentElement.classList.add('privacy-enabled');
    } else {
      document.documentElement.classList.remove('privacy-enabled');
    }
  };

  const dataDensity = ref(localStorage.getItem('dataDensity') || 'cozy');

  const toggleDataDensity = () => {
    dataDensity.value = dataDensity.value === 'cozy' ? 'compact' : 'cozy';
    localStorage.setItem('dataDensity', dataDensity.value);
    applyDataDensity();
  };

  const applyDataDensity = () => {
    if (dataDensity.value === 'compact') {
      document.documentElement.classList.add('density-compact');
    } else {
      document.documentElement.classList.remove('density-compact');
    }
  };

  const initTheme = () => {
    applyTheme();
    applyPrivacyMode();
    applyDataDensity();
  };

  applyTheme();
  applyPrivacyMode();
  applyDataDensity();

  const toasts = ref([]);
  const addToast = (message, type = 'info', duration = 4000, onUndo = null) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    toasts.value.push({ id, message, type, duration, onUndo });
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  };
  const removeToast = (id) => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  };

  return {
    sidebarOpen,
    colorMode,
    stylePreset,
    theme: colorMode,
    notifications,
    notificationDrawerOpen,
    isOnline,
    pendingSyncCount,
    dataRefreshTrigger,
    triggerDataRefresh,
    toggleSidebar,
    toggleColorMode,
    toggleTheme: toggleColorMode,
    setStylePreset,
    applyTheme,
    initTheme,
    toggleNotificationDrawer,
    privacyMode,
    togglePrivacyMode,
    toasts,
    addToast,
    removeToast,
    dataDensity,
    toggleDataDensity,
    applyDataDensity,
  };
});
