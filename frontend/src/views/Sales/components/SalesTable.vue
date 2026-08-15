<template>
  <div class="sales-table-container">
    <!-- Table content will be extracted here -->
    <table class="table">
      <thead>
        <tr>
          <th>رقم الفاتورة</th>
          <th>التاريخ</th>
          <th>العميل</th>
          <th>الإجمالي</th>
          <th>خيارات</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="sale in sales" :key="sale.id">
          <td>{{ sale.sale_number }}</td>
          <td>{{ sale.created_at }}</td>
          <td>{{ sale.customer_name }}</td>
          <td>{{ sale.total_amount }}</td>
          <td><!-- Actions --></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
interface SaleRow {
  id: number | string;
  sale_number: string;
  created_at: string;
  customer_name?: string;
  total_amount?: number;
  [key: string]: any;
}

withDefaults(defineProps<{ sales?: SaleRow[] }>(), {
  sales: () => [],
});
</script>
