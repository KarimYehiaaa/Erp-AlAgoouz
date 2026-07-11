import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'copilot', name: 'AiCopilot', component: () => import('@/views/AiCopilotView.vue'), meta: { permission: 'dashboard.view' } },
      { path: 'branch-sales', name: 'BranchSales', component: () => import('@/views/BranchSalesView.vue') },
      { path: 'sales', name: 'Sales', component: () => import('@/views/SalesView.vue') },
      { path: 'pos', redirect: '/branch-sales' },
      { path: 'products', name: 'Products', component: () => import('@/views/ProductsView.vue'), meta: { permission: 'products.manage' } },
      { path: 'purchases', name: 'Purchases', component: () => import('@/views/PurchasesAndExpensesView.vue'), meta: { permission: ['inventory.manage', 'expenses.manage'] } },
      { path: 'inventory', name: 'Inventory', component: () => import('@/views/InventoryView.vue'), meta: { permission: 'inventory.manage' } },
      { path: 'stocktakes', name: 'Stocktakes', component: () => import('@/views/StocktakesView.vue'), meta: { permission: 'inventory.manage' } },
      { path: 'stocktakes/:id', name: 'StocktakeDetails', component: () => import('@/views/StocktakeFormView.vue'), meta: { permission: 'inventory.manage' } },
      { path: 'costs', name: 'Costs', component: () => import('@/views/CostsView.vue'), meta: { permission: 'products.manage' } },
      { path: 'recipes', name: 'Recipes', component: () => import('@/views/RecipesView.vue'), meta: { permission: 'products.manage' } },
      { path: 'customers', name: 'Customers', component: () => import('@/views/CustomersView.vue'), meta: { permission: 'customers.manage' } },
      { path: 'invoices', name: 'Invoices', component: () => import('@/views/InvoicesView.vue'), meta: { permission: 'invoices.manage' } },
      { path: 'invoices/create', name: 'InvoiceCreate', component: () => import('@/views/InvoiceFormView.vue'), meta: { permission: 'invoices.manage' } },
      { path: 'invoices/:id/edit', name: 'InvoiceEdit', component: () => import('@/views/InvoiceFormView.vue'), meta: { permission: 'invoices.manage' } },
      { path: 'invoices/quotes', name: 'QuotationCreate', component: () => import('@/views/QuotesView.vue'), meta: { permission: 'invoices.manage' } },
      { path: 'invoices/:id', name: 'InvoiceDetail', component: () => import('@/views/InvoicePrintView.vue'), meta: { permission: 'invoices.manage' } },
      { path: 'expenses', redirect: '/purchases?tab=expenses' },
      { path: 'suppliers', name: 'Suppliers', component: () => import('@/views/SuppliersView.vue'), meta: { permission: 'suppliers.manage' } },
      { path: 'hr', name: 'HR', component: () => import('@/views/HrView.vue'), meta: { permission: 'hr.manage' } },
      { path: 'reports', name: 'Reports', component: () => import('@/views/ReportsView.vue'), meta: { permission: 'reports.view' } },
      { path: 'operations', name: 'Operations', component: () => import('@/views/OperationsView.vue'), meta: { permission: 'reports.view' } },
      { path: 'forecasting', name: 'Forecasting', component: () => import('@/views/ForecastingView.vue'), meta: { permission: 'reports.view' } },
      { path: 'users', name: 'Users', component: () => import('@/views/UsersView.vue'), meta: { permission: 'users.manage' } },
      { path: 'settings', name: 'Settings', component: () => import('@/views/SettingsView.vue'), meta: { permission: 'settings.manage' } },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();
  
  if (auth.isAuthenticated && !auth.profileLoaded) {
    await auth.fetchProfile();
  }
  
  if (to.meta.requiresAuth && !auth.isAuthenticated) return next('/login');
  if (to.meta.guest && auth.isAuthenticated) return next('/');
  
  if (to.meta.permission && auth.isAuthenticated) {
    const hasPerm = Array.isArray(to.meta.permission)
      ? to.meta.permission.some((p) => auth.hasPermission(p))
      : auth.hasPermission(to.meta.permission);
    if (!hasPerm) {
      return next('/');
    }
  }
  
  next();
});

export default router;
