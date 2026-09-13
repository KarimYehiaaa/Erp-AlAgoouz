import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';

export const usePosShiftStore = defineStore('posShift', () => {
  const currentShift = ref<any>(null);
  const loading = ref(false);
  const isShiftOpen = computed(() => !!currentShift.value && currentShift.value.status === 'open');

  const fetchCurrentShift = async () => {
    loading.value = true;
    try {
      const res = await api.get('/pos/shifts/current');
      if (res.data.success) {
        currentShift.value = res.data.data;
      } else {
        currentShift.value = null;
      }
    } catch {
      // Offline fallback: check local storage
      const cached = localStorage.getItem('pos_local_shift');
      if (cached) currentShift.value = JSON.parse(cached);
    } finally {
      loading.value = false;
    }
  };

  const openShift = async (openingCash: number, notes?: string) => {
    loading.value = true;
    try {
      const res = await api.post('/pos/shifts/open', {
        opening_cash: openingCash,
        notes,
      });
      if (res.data.success) {
        currentShift.value = res.data.data;
        localStorage.setItem('pos_local_shift', JSON.stringify(res.data.data));
        return res.data.data;
      }
      throw new Error(res.data.message || 'فشل فتح الوردية');
    } catch (err: any) {
      // Local fallback shift if offline
      const mockShift = {
        id: `offline_shf_${Date.now()}`,
        shift_number: `OFF-SHF-${Date.now().toString().slice(-6)}`,
        opened_at: new Date().toISOString(),
        opening_cash: openingCash,
        expected_cash: openingCash,
        status: 'open',
        notes: notes || 'وردية مسجلة دون اتصال',
      };
      currentShift.value = mockShift;
      localStorage.setItem('pos_local_shift', JSON.stringify(mockShift));
      return mockShift;
    } finally {
      loading.value = false;
    }
  };

  const closeShift = async (actualCash: number, notes?: string) => {
    if (!currentShift.value) return;
    loading.value = true;
    try {
      const res = await api.post(`/pos/shifts/${currentShift.value.id}/close`, {
        actual_cash: actualCash,
        notes,
      });
      if (res.data.success) {
        currentShift.value = null;
        localStorage.removeItem('pos_local_shift');
        return res.data.data;
      }
      throw new Error(res.data.message || 'فشل إغلاق الوردية');
    } finally {
      loading.value = false;
    }
  };

  return {
    currentShift,
    loading,
    isShiftOpen,
    fetchCurrentShift,
    openShift,
    closeShift,
  };
});
