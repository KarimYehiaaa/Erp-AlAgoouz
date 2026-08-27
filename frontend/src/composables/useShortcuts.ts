/**
 * useShortcuts.ts — اختصارات لوحة المفاتيح ووضع تركيز الكاشير
 * يوفّر اختصارات عامة للشاشات الأكثر استخدامًا:
 *  - F2  → بيع جديد (شاشة المبيعات)
 *  - F3  → فتح البحث العالمي (Command Palette)
 *  - F4  → تبديل وضع تركيز الكاشير (إخفاء كل شيء إلا شاشة البيع)
 *  - Esc → الخروج من وضع التركيز
 *
 * وضع التركيز: يضيف class `cashier-focus` على <html> يُستخدم في CSS
 * لإخفاء الشريط الجانبي والقوائم والحفاظ على شاشة العمل فقط.
 *
 * الاستخدام: يُستدعى مرة واحدة من App.vue (onMounted) وتُسجَّل
 * الاستماعات تلقائيًا وتُزال عند unmount.
 */
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';

/** فتح Command Palette عبر حدث مخصص (يستمع إليه CommandPalette.vue). */
const openPalette = () => {
  window.dispatchEvent(new CustomEvent('open-command-palette'));
};

/**
 * تفعيل اختصارات لوحة المفاتيح العالمية.
 * تُسجَّل مستمعات window وتُزال تلقائيًا عند إزالة المكوّن.
 */
export function useShortcuts(): void {
  const router = useRouter();
  const appStore = useAppStore();

  const onKeydown = (e: KeyboardEvent) => {
    // تجاهل الاختصارات أثناء الكتابة في حقول إدخال
    const target = e.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    if (e.key === 'Escape' && appStore.focusMode) {
      appStore.toggleFocusMode();
      return;
    }

    if (typing) return;

    // Ctrl/Cmd + K → البحث العالمي
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }

    switch (e.key) {
      case 'F2': // بيع جديد
        e.preventDefault();
        router.push('/sales');
        break;
      case 'F3': // البحث العالمي
        e.preventDefault();
        openPalette();
        break;
      case 'F4': // وضع تركيز الكاشير
        e.preventDefault();
        appStore.toggleFocusMode();
        break;
      default:
        break;
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', onKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
  });
}
