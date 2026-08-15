import { ref, reactive, onMounted, onUnmounted } from 'vue';

/* ═══════════════════════════════════════════════════════════
   Mouse Parallax Tracking
   ═══════════════════════════════════════════════════════════ */

/**
 * تأثير تتبع الماوس (Parallax) — يُحرك العناصر بنسبة محددة حسب موضع المؤشر.
 * @param {number} [intensity] قوة الإزاحة (افتراضي 15)
 * @returns {{ offset: { x: number, y: number } }} إزاحة تفاعلية
 */
export function useMouseParallax(intensity = 15) {
  const offset = reactive({ x: 0, y: 0 });
  let ticking = false;

  const handleMouseMove = (e: any) => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      offset.x = ((e.clientX - centerX) / centerX) * intensity;
      offset.y = ((e.clientY - centerY) / centerY) * intensity;
      ticking = false;
    });
  };

  onMounted(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
  });

  onUnmounted(() => {
    window.removeEventListener('mousemove', handleMouseMove);
  });

  return { offset };
}

/* ═══════════════════════════════════════════════════════════
   Password Strength Calculator
   ═══════════════════════════════════════════════════════════ */

/**
 * تقييم قوة كلمة المرور (الطول، الحروف، الأرقام، الرموز) مع تسمية ولون.
 * @returns {{ strength: { score: number, label: string, color: string, percentage: number }, evaluate: (password: string) => void }}
 */
export function usePasswordStrength() {
  const strength = reactive({
    score: 0,
    label: '',
    color: 'transparent',
    percentage: 0,
  });

  const levels = [
    { label: '', color: 'transparent' },
    { label: 'ضعيفة جداً', color: '#EF4444' },
    { label: 'ضعيفة', color: '#F97316' },
    { label: 'متوسطة', color: '#EAB308' },
    { label: 'قوية', color: '#22C55E' },
  ];

  const evaluate = (password: any) => {
    if (!password) {
      Object.assign(strength, { score: 0, label: '', color: 'transparent', percentage: 0 });
      return;
    }

    let score = 0;

    if (password.length >= 6) score++;
    if (password.length >= 10) score++;

    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (/(.)\1{2,}/.test(password)) score--;
    if (/^(123|abc|password|qwerty)/i.test(password)) score--;

    score = Math.max(1, Math.min(4, score));

    const level = levels[score]!;
    Object.assign(strength, {
      score,
      label: level.label,
      color: level.color,
      percentage: (score / 4) * 100,
    });
  };

  return { strength, evaluate };
}

/* ═══════════════════════════════════════════════════════════
   Input Focus Micro-animation Controller
   ═══════════════════════════════════════════════════════════ */

/**
 * تتبع الحقل النشط في النماذج لتفعيل حركات التركيز (micro-animations).
 * @returns {{ activeField: Ref<string | null>, onFocusField: (name: string) => void, onBlurField: () => void, isFieldActive: (name: string) => boolean }}
 */
export function useInputAnimations() {
  const activeField = ref<any>(null);

  const onFocusField = (fieldName: any) => {
    activeField.value = fieldName;
  };

  const onBlurField = () => {
    activeField.value = null;
  };

  const isFieldActive = (fieldName: any) => activeField.value === fieldName;

  return {
    activeField,
    onFocusField,
    onBlurField,
    isFieldActive,
  };
}

/* ═══════════════════════════════════════════════════════════
   Staggered Entrance Animation
   ═══════════════════════════════════════════════════════════ */

/**
 * حركة دخول متدرجة لعناصر (تظهر واحدًا تلو الآخر بفارق زمني).
 * @param {number} itemCount عدد العناصر
 * @param {number} [baseDelay] الفارق الزمني بالملي ثانية (افتراضي 80)
 * @returns {{ visibleItems: Ref<boolean[]> }}
 */
export function useStaggeredEntrance(itemCount: number, baseDelay = 80) {
  const visibleItems = ref(new Array(itemCount).fill(false));

  onMounted(() => {
    for (let i = 0; i < itemCount; i++) {
      setTimeout(
        () => {
          visibleItems.value[i] = true;
        },
        baseDelay * (i + 1),
      );
    }
  });

  return { visibleItems };
}
