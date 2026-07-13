<template>
  <div v-if="invoice" class="invoice-page">
    <div class="inv-actions no-print">
      <button type="button" class="btn btn-primary" @click="printInvoice">🖨️ طباعة</button>
      <button type="button" class="btn btn-outline" :disabled="pdfLoading" @click="downloadPdf">
        {{ pdfLoading ? 'جاري التحميل...' : '📄 تحميل PDF' }}
      </button>
      <router-link to="/invoices" class="btn btn-outline">رجوع</router-link>
      <router-link to="/invoices/create" class="btn btn-outline">فاتورة جديدة</router-link>
    </div>

    <div v-if="pdfError" class="pdf-error no-print">{{ pdfError }}</div>

    <div id="invoice-pdf-root" class="invoice-print-wrap">
      <InvoiceDocument :invoice="invoice" />
    </div>
  </div>
  <div v-else-if="loading" class="card">جاري التحميل...</div>
  <div v-else class="card">الفاتورة غير موجودة</div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import InvoiceDocument from '@/components/InvoiceDocument.vue';
import { invoices as api } from '@/api';

const route = useRoute();
const invoice = ref(null);
const loading = ref(true);
const pdfLoading = ref(false);
const pdfError = ref('');

onMounted(async () => {
  try {
    const res = await api.get(route.params.id);
    invoice.value = res.data;
  } finally {
    loading.value = false;
  }
});

const printInvoice = () => window.print();

const downloadPdf = async () => {
  const el = document.getElementById('invoice-pdf-root');
  if (!el || !invoice.value) return;
  pdfLoading.value = true;
  pdfError.value = '';
  try {
    await downloadClientPdf(el);
  } catch {
    try {
      await downloadServerPdf();
    } catch (error) {
      console.error(error);
      pdfError.value = 'تعذر تحميل ملف PDF. يرجى المحاولة مرة أخرى أو استخدام أمر الطباعة.';
    }
  } finally {
    pdfLoading.value = false;
  }
};

const downloadClientPdf = async (el) => {
  const module = await import('html2pdf.js');
  const html2pdf = module.default || module;
  await html2pdf()
    .set({
      margin: [8, 8, 8, 8],
      filename: `invoice-${invoice.value.invoice_number}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save();
};

const downloadServerPdf = async () => {
  const blob = await api.downloadPdf(route.params.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${invoice.value.invoice_number}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<style lang="scss" scoped>
.invoice-page { max-width: 860px; margin: 0 auto; }
.inv-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}
.pdf-error {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  color: var(--danger);
  font-weight: 700;
}
.invoice-print-wrap {
  box-shadow: var(--shadow);
  border-radius: var(--radius);
  overflow: hidden;
}

@media print {
  .no-print { display: none !important; }
  .invoice-page { max-width: none; margin: 0; }
  .invoice-print-wrap { box-shadow: none; border-radius: 0; }
  :deep(.invoice-doc) { padding: 16px; }
}
</style>
