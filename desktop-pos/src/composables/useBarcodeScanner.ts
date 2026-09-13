/**
 * composables/useBarcodeScanner.ts — معالج قارئ الباركود الليزري المكتبي (HID Keyboard Buffer)
 * يلتقط إدخال قارئ الباركود في أي مكان بالشاشة دون الحاجة للتركيز على حقل إدخال محدد
 */
import { onMounted, onBeforeUnmount } from 'vue';

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  let barcodeBuffer = '';
  let lastKeyTime = 0;
  const maxDelayBetweenChars = 50; // ms (Scanners send keys with <20ms delay)

  const handleKeyDown = (e: KeyboardEvent) => {
    // If typing in an active text input or textarea, let the default behavior happen unless it's a fast burst
    const activeEl = document.activeElement as HTMLElement | null;
    const isEditingField =
      activeEl &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
      activeEl.getAttribute('type') !== 'search';

    const now = performance.now();
    const timeDelta = now - lastKeyTime;
    lastKeyTime = now;

    if (e.key === 'Enter') {
      if (barcodeBuffer.length >= 3) {
        e.preventDefault();
        const scannedCode = barcodeBuffer.trim();
        barcodeBuffer = '';
        onScan(scannedCode);
      } else {
        barcodeBuffer = '';
      }
      return;
    }

    if (timeDelta > maxDelayBetweenChars && barcodeBuffer.length > 0) {
      // Too slow to be a barcode scanner, reset buffer
      barcodeBuffer = '';
    }

    // Only collect printable characters
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // If we are actively editing a normal field, do not capture single slow keystrokes
      if (isEditingField && timeDelta > maxDelayBetweenChars) {
        return;
      }
      barcodeBuffer += e.key;
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
}
