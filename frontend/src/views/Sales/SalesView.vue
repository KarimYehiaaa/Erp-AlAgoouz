<template>
  <div class="sales-page">
    <SalesFilters @filter="onFilter" />
    <SalesTable :sales="salesData" @edit="onEdit" @delete="onDelete" />
    <SalesForm
      v-if="showForm"
      :saleData="editingSale"
      @saved="fetchSales"
      @closed="showForm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SalesFilters from './components/SalesFilters.vue';
import SalesTable from './components/SalesTable.vue';
import SalesForm from './components/SalesForm.vue';

const salesData = ref<any[]>([]);
const showForm = ref(false);
const editingSale = ref<any>(null);

const onFilter = (__filters: any) => {
  // Fetch sales based on filters
};

const onEdit = (sale: any) => {
  editingSale.value = sale;
  showForm.value = true;
};

const onDelete = (__id: any) => {
  // Delete logic
};

const fetchSales = () => {
  // Refetch
  showForm.value = false;
};
</script>
