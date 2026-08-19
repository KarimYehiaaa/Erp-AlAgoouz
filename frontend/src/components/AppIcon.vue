<template>
  <component
    :is="IconComponent"
    class="app-icon"
    :size="Number(size)"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
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
  Pencil,
  Trash2,
  Calendar,
  Clock,
  Coins,
  TrendingUp,
  TrendingDown,
  UserCheck,
  Receipt,
  Plus,
  Sparkles,
  Eye,
  EyeOff,
  Coffee,
  Maximize2,
  Minimize2,
  Timer,
  TimerOff,
  RefreshCw,
  Zap,
  Bot,
  Cpu,
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
  coffee: Coffee,
  zap: Zap,
  bot: Bot,
  cpu: Cpu,
  products: Package,
  purchases: ShoppingCart,
  inventory: Boxes,
  costs: Calculator,
  recipes: ClipboardList,
  stocktake: ClipboardList,
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
  edit: Pencil,
  delete: Trash2,
  trash: Trash2,
  calendar: Calendar,
  clock: Clock,
  coins: Coins,
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
  userCheck: UserCheck,
  receipt: Receipt,
  plus: Plus,
  add: Plus,
  copilot: Sparkles,
  eye: Eye,
  eyeOff: EyeOff,
  maximize: Maximize2,
  minimize: Minimize2,
  timer: Timer,
  timerOff: TimerOff,
  refresh: RefreshCw,
};

const aliases = {
  // Emoji compatibility mappings
  '💰': 'coins',
  '🧾': 'receipt',
  '📅': 'calendar',
  '🕐': 'clock',
  '✅': 'check',
  '⚠️': 'warning',
  '👥': 'customers',
  '✏️': 'edit',
  '🗑️': 'delete',
  '+': 'plus',
  '➕': 'plus',

  // Original aliases
  product: 'products',
  invoice: 'invoices',
  supplier: 'suppliers',
  expense: 'expenses',
  user: 'users',
  chart: 'reports',
};

const IconComponent = computed(() => {
  const key = aliases[props.name as keyof typeof aliases] || props.name;
  return icons[key as keyof typeof icons] || icons.dashboard;
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
