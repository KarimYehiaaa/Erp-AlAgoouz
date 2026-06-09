<template>
  <component
    :is="IconComponent"
    class="app-icon"
    :size="size"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>

<script setup>
import { computed } from 'vue';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  Calculator,
  Check,
  ClipboardList,
  Download,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Palette,
  ReceiptText,
  Save,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  Users,
  WalletCards,
  X,
} from '@lucide/vue';

const props = defineProps({
  name: { type: String, default: 'dashboard' },
  size: { type: [Number, String], default: 20 },
  strokeWidth: { type: [Number, String], default: 2 },
});

const icons = {
  dashboard: LayoutDashboard,
  gauge: Gauge,
  shop: Store,
  sales: ReceiptText,
  coffee: Package,
  products: Package,
  purchases: ShoppingCart,
  inventory: Boxes,
  costs: Calculator,
  recipes: ClipboardList,
  customers: Users,
  invoices: FileText,
  quote: FileText,
  expenses: WalletCards,
  suppliers: Truck,
  reports: BarChart3,
  users: ShieldCheck,
  settings: Settings,
  search: Search,
  money: WalletCards,
  warning: AlertTriangle,
  check: Check,
  close: X,
  theme: Palette,
  moon: Moon,
  sun: Sun,
  save: Save,
  download: Download,
  menu: Menu,
  logout: LogOut,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
};

const aliases = {
  product: 'products',
  invoice: 'invoices',
  supplier: 'suppliers',
  expense: 'expenses',
  user: 'users',
  chart: 'reports',
};

const IconComponent = computed(() => {
  const key = aliases[props.name] || props.name;
  return icons[key] || icons.dashboard;
});
</script>

<style scoped>
.app-icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: -0.16em;
  color: currentColor;
  flex-shrink: 0;
}
</style>
