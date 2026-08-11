<template>
  <div class="sales-form-modal">
    <!-- Form content will be extracted here -->
    <form @submit.prevent="saveSale">
      <!-- Inputs for products, discounts, etc. -->
    </form>
  </div>
</template>

<script setup>
const emit = defineEmits(['saved', 'closed'])

const saveSale = () => {
  // logic
  emit('saved')
}
</script>
