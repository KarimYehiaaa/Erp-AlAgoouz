import type { Directive } from 'vue';

/**
 * v-spotlight — توهج داخلي ذهبي يتبع مؤشر الفأرة على البطاقات.
 * يضبط متغيري --mx/--my الذي تستخدمه طبقة CSS في main.scss.
 * الاستخدام: <div class="card" v-spotlight>
 */
export const spotlightDirective: Directive<HTMLElement> = {
  mounted(el) {
    el.classList.add('spotlight');
    const move = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };
    el.addEventListener('mousemove', move, { passive: true });
    (el as any)._spotlightMove = move;
  },
  unmounted(el) {
    const move = (el as any)._spotlightMove;
    if (move) el.removeEventListener('mousemove', move);
    delete (el as any)._spotlightMove;
  },
};
