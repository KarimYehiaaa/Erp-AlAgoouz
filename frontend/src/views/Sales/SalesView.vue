<template>
  <div class="sales-page">
    <SalesFilters @filter="onFilter" />
    <SalesTable :sales="salesData" @edit="onEdit" @delete="onDelete" />
    <SalesForm v-if="showForm" :saleData="editingSale" @saved="fetchSales" @closed="showForm = false" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import SalesFilters from './components/SalesFilters.vue'
import SalesTable from './components/SalesTable.vue'
import SalesForm from './components/SalesForm.vue'

const salesData = ref([])
const showForm = ref(false)
const editingSale = ref(null)

const onFilter = (filters) => {
  // Fetch sales based on filters
}

const onEdit = (sale) => {
  editingSale.value = sale
  showForm.value = true
}

const onDelete = (id) => {
  // Delete logic
}

const fetchSales = () => {
  // Refetch
  showForm.value = false
}
</script>
