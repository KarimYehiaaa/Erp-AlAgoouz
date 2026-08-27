/**
 * useInventoryExcel — منطق تبويب "استرداد بـ Excel" في شاشة المخزون
 * تحميل قالب الاسترداد + فحص الملف + تنفيذ الاسترداد الجماعي،
 * مع عرض النتيجة (معاينة/تفاصيل/أخطاء) في بطاقة النتيجة.
 * استُخرج من InventoryView.vue (كان السكربت 1,564 سطرًا).
 */
import { ref } from 'vue';
import { inventory as inventoryApi } from '@/api';

/** الاعتماديات المشتركة الممرّرة من الـ view (الرسائل، إعادة التحميل). */
export interface InventoryExcelContext {
  setMsg: (_text: string, _isErr?: boolean) => void;
  reload: () => Promise<void>;
}

/**
 * composable استرداد المخزون عبر Excel.
 * @param {InventoryExcelContext} ctx السياق المشترك من الـ view
 * @returns {{
 *   returnWarehouseId: import('vue').Ref<string>,
 *   downloadingTemplate: import('vue').Ref<boolean>,
 *   excelResult: import('vue').Ref<any>,
 *   downloadTemplate: () => Promise<void>,
 *   onValidate: (file: File) => Promise<void>,
 *   onImport: (file: File) => Promise<void>,
 * }}
 */
export function useInventoryExcel(ctx: InventoryExcelContext) {
  const { setMsg, reload } = ctx;

  const returnWarehouseId = ref('');
  const downloadingTemplate = ref(false);
  const excelResult = ref<any>(null);

  /** تحميل قالب الاسترداد (مع فلترة المخزن إن وُجد). */
  const downloadTemplate = async () => {
    downloadingTemplate.value = true;
    try {
      const blob = (await inventoryApi.downloadReturnTemplate(
        returnWarehouseId.value ?? undefined,
      )) as unknown as Blob;
      const url = URL.createObjectURL(new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory-return-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setMsg(e.message || 'فشل تحميل القالب.', true);
    } finally {
      downloadingTemplate.value = false;
    }
  };

  /** فحص ملف الاسترداد قبل التنفيذ. */
  const onValidate = async (file: File) => {
    excelResult.value = null;
    try {
      const res = await inventoryApi.validateReturnExcel(file);
      const d = res?.data || res;
      const success = Number(d.success || 0);
      excelResult.value = {
        ok: success > 0,
        title: success > 0 ? ` تم استرداد ${success} منتج بنجاح` : ` لم يتم تطبيق أي صف صالح`,
        summary: `${d.skipped || 0} صف تم تخطيه · ${d.failed?.length || 0} فشل`,
        details: d.details || [],
        failed: d.failed || [],
      };
      if (success > 0) {
        setMsg(`تم استرداد ${success} منتج للمخزون.`);
        await reload();
      }
    } catch (e: any) {
      excelResult.value = {
        ok: false,
        title: 'فشل فحص الملف',
        summary: e.message,
        errors: [e.message],
      };
    }
  };

  /** رفع وتنفيذ الاسترداد الجماعي. */
  const onImport = async (file: File) => {
    excelResult.value = null;
    try {
      const res = await inventoryApi.importReturnExcel(file, returnWarehouseId.value ?? undefined);
      const d = res?.data || res;
      excelResult.value = {
        ok: true,
        title: ` تم استرداد ${d.success} منتج بنجاح`,
        summary: `${d.skipped || 0} صف تم تخطيه · ${d.failed?.length || 0} فشل`,
        details: d.details || [],
        failed: d.failed || [],
      };
      if (d.success > 0) {
        setMsg(`تم استرداد ${d.success} منتج للمخزون.`);
        await reload();
      }
    } catch (e: any) {
      excelResult.value = {
        ok: false,
        title: 'فشل الاستيراد',
        summary: e.message,
        errors: [e.message],
      };
    }
  };

  return {
    returnWarehouseId,
    downloadingTemplate,
    excelResult,
    downloadTemplate,
    onValidate,
    onImport,
  };
}
