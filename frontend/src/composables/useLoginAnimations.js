import { ref, reactive, onMounted, onUnmounted } from 'vue';

/* ═══════════════════════════════════════════════════════════
   Mouse Parallax Tracking
   ═══════════════════════════════════════════════════════════ */

export function useMouseParallax(intensity = 15) {
  const offset = reactive({ x: 0, y: 0 });
  let ticking = false;

  const handleMouseMove = (e) => {
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

  const evaluate = (password) => {
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

    const level = levels[score];
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

export function useInputAnimations() {
  const activeField = ref(null);

  const onFocusField = (fieldName) => {
    activeField.value = fieldName;
  };

  const onBlurField = () => {
    activeField.value = null;
  };

  const isFieldActive = (fieldName) => activeField.value === fieldName;

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

export function useStaggeredEntrance(itemCount, baseDelay = 80) {
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
