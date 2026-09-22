import { ref, computed } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { posApi } from '@/api/pos.api';
import type { PosShift, CashMovement } from '@/api/pos.api';
import { useAppStore } from '@/stores/app';

// Singleton Module-level Reactive State (Shared across CashierHeader, PosView, and ShiftModals)
const currentShift: Ref<PosShift | null> = ref(null);
const isShiftOpen: ComputedRef<boolean> = computed(() => !!currentShift.value);
const shiftLoading: Ref<boolean> = ref(false);

const showOpenShiftModal: Ref<boolean> = ref(false);
const showCloseShiftModal: Ref<boolean> = ref(false);
const showCashMovementModal: Ref<boolean> = ref(false);

export function usePosShift() {
  const appStore = useAppStore();

  const checkActiveShift = async () => {
    shiftLoading.value = true;
    try {
      const response = await posApi.getCurrentShift();
      if (response?.data) {
        currentShift.value = response.data;
      } else {
        currentShift.value = null;
        showOpenShiftModal.value = true;
      }
    } catch (error: any) {
      currentShift.value = null;
      if (error?.response?.status === 404) {
        showOpenShiftModal.value = true;
      } else {
        appStore.addToast(
          error?.response?.data?.message || error?.message || 'حدث خطأ أثناء جلب الوردية',
          'error',
        );
      }
    } finally {
      shiftLoading.value = false;
    }
  };

  const openShift = async (openingCash: number) => {
    shiftLoading.value = true;
    try {
      const response = await posApi.openShift({ opening_cash: openingCash });
      currentShift.value = response.data;
      showOpenShiftModal.value = false;
      appStore.addToast('تم فتح الوردية بنجاح', 'success');
    } catch (error: any) {
      appStore.addToast(
        error?.response?.data?.message || error?.message || 'حدث خطأ أثناء فتح الوردية',
        'error',
      );
    } finally {
      shiftLoading.value = false;
    }
  };

  const closeShift = async (actualCash: number, notes?: string) => {
    if (!currentShift.value) return null;

    shiftLoading.value = true;
    try {
      const response = await posApi.closeShift(currentShift.value.id, {
        actual_cash: actualCash,
        notes,
      });
      const closedShift = response.data;
      currentShift.value = null;
      showCloseShiftModal.value = false;

      // Calculate cash difference for toast message
      const diff = actualCash - closedShift.expected_cash;
      const diffMessage = diff !== 0 ? ` (الفارق: ${diff})` : '';

      appStore.addToast(`تم إغلاق الوردية بنجاح${diffMessage}`, 'success');

      return closedShift;
    } catch (error: any) {
      appStore.addToast(
        error?.response?.data?.message || error?.message || 'حدث خطأ أثناء إغلاق الوردية',
        'error',
      );
      return null;
    } finally {
      shiftLoading.value = false;
    }
  };

  const recordCashMovement = async (data: CashMovement) => {
    shiftLoading.value = true;
    try {
      await posApi.recordCashMovement(data);
      await refreshShiftStats();
      showCashMovementModal.value = false;
      appStore.addToast('تم تسجيل الحركة النقدية بنجاح', 'success');
    } catch (error: any) {
      appStore.addToast(
        error?.response?.data?.message || error?.message || 'حدث خطأ أثناء تسجيل الحركة',
        'error',
      );
    } finally {
      shiftLoading.value = false;
    }
  };

  const refreshShiftStats = async () => {
    try {
      const response = await posApi.getCurrentShift();
      if (response?.data) {
        currentShift.value = response.data;
      }
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        appStore.addToast(
          error?.response?.data?.message || error?.message || 'حدث خطأ أثناء تحديث بيانات الوردية',
          'error',
        );
      }
    }
  };

  return {
    currentShift,
    isShiftOpen,
    shiftLoading,
    showOpenShiftModal,
    showCloseShiftModal,
    showCashMovementModal,
    checkActiveShift,
    openShift,
    closeShift,
    recordCashMovement,
    refreshShiftStats,
  };
}
