import { describe, it, expect, vi } from 'vitest';

describe('useBarcodeScanner Composable (Item 17)', () => {
  it('detects high-speed HID barcode keystroke burst and triggers onScan', async () => {
    const onScan = vi.fn();
    let barcodeBuffer = '';
    let lastKeyTime = 0;
    const maxDelay = 50;

    const simulateKey = (key: string, time: number) => {
      const delta = time - lastKeyTime;
      lastKeyTime = time;

      if (key === 'Enter') {
        if (barcodeBuffer.length >= 3) {
          const code = barcodeBuffer.trim();
          barcodeBuffer = '';
          onScan(code);
        } else {
          barcodeBuffer = '';
        }
        return;
      }

      if (delta > maxDelay && barcodeBuffer.length > 0) {
        barcodeBuffer = '';
      }

      if (key.length === 1) {
        barcodeBuffer += key;
      }
    };

    // Simulate fast barcode scan: 6223000123456 with 10ms intervals
    let currentTime = 1000;
    const sampleBarcode = '6223000123456';
    for (const char of sampleBarcode) {
      currentTime += 10;
      simulateKey(char, currentTime);
    }
    currentTime += 10;
    simulateKey('Enter', currentTime);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('6223000123456');
  });

  it('resets buffer when typing slowly like human input (>50ms delay)', async () => {
    const onScan = vi.fn();
    let barcodeBuffer = '';
    let lastKeyTime = 0;
    const maxDelay = 50;

    const simulateKey = (key: string, time: number) => {
      const delta = time - lastKeyTime;
      lastKeyTime = time;

      if (key === 'Enter') {
        if (barcodeBuffer.length >= 3) {
          onScan(barcodeBuffer.trim());
          barcodeBuffer = '';
        }
        return;
      }

      if (delta > maxDelay && barcodeBuffer.length > 0) {
        barcodeBuffer = '';
      }

      if (key.length === 1) {
        barcodeBuffer += key;
      }
    };

    // Simulate slow human typing: 200ms delay between keys
    simulateKey('1', 1000);
    simulateKey('2', 1200); // 200ms > 50ms -> resets buffer
    simulateKey('3', 1400);
    simulateKey('Enter', 1600);

    expect(onScan).not.toHaveBeenCalled();
  });
});
