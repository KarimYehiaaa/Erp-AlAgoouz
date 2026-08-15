import { ref, onUnmounted, type Ref } from 'vue';

/** خيارات تأثير الكتابة. */
export interface TypingOptions {
  phrases?: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}

/**
 * تأثير كتابة/حذف تلقائي للعبارات (تأثير الآلة الكاتبة).
 * @param {TypingOptions} [options] الخيارات
 * @returns {{ displayedText: Ref<string>, cursorVisible: Ref<boolean>, isTyping: Ref<boolean>, start: () => void, stop: () => void }}
 */
export function useTypingEffect(options: TypingOptions = {}) {
  const { phrases = [], typingSpeed = 120, deletingSpeed = 60, pauseDuration = 2200 } = options;

  const displayedText = ref('');
  const cursorVisible = ref(true);
  const isTyping = ref(true);

  let currentPhraseIndex = 0;
  let currentCharIndex = 0;
  let isDeleting = false;
  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;

  const tick = () => {
    if (!phrases.length) return;
    const currentPhrase = phrases[currentPhraseIndex]!;

    if (!isDeleting) {
      // Typing forward
      currentCharIndex++;
      displayedText.value = currentPhrase.slice(0, currentCharIndex);
      isTyping.value = true;

      if (currentCharIndex === currentPhrase.length) {
        // Finished typing — pause then start deleting
        isTyping.value = false;
        typingTimer = setTimeout(() => {
          isDeleting = true;
          tick();
        }, pauseDuration);
        return;
      }

      // Randomize speed slightly for natural feel
      const variance = Math.random() * 60 - 30;
      typingTimer = setTimeout(tick, typingSpeed + variance);
    } else {
      // Deleting
      currentCharIndex--;
      displayedText.value = currentPhrase.slice(0, currentCharIndex);
      isTyping.value = true;

      if (currentCharIndex === 0) {
        // Move to next phrase
        isDeleting = false;
        currentPhraseIndex = (currentPhraseIndex + 1) % phrases.length;
        typingTimer = setTimeout(tick, typingSpeed * 2);
        return;
      }

      typingTimer = setTimeout(tick, deletingSpeed);
    }
  };

  const start = () => {
    // Start typing
    tick();

    // Cursor blink
    cursorTimer = setInterval(() => {
      cursorVisible.value = !cursorVisible.value;
    }, 530);
  };

  const stop = () => {
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    if (cursorTimer) {
      clearInterval(cursorTimer);
      cursorTimer = null;
    }
  };

  onUnmounted(stop);

  return {
    displayedText,
    cursorVisible,
    isTyping,
    start,
    stop,
  };
}
