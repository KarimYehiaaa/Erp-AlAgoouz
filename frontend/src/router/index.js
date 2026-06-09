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
      { path: 'branch-sales', name: 'BranchSales', component: () => import('@/views/BranchSalesView.vue') },
      { path: 'sales', name: 'Sales', component: () => import('@/views/SalesView.vue') },
      { path: 'pos', redirect: '/branch-sales' },
      { path: 'products', name: 'Products', component: () => import('@/views/ProductsView.vue') },
      { path: 'purchases', name: 'Purchases', component: () => import('@/views/PurchasesView.vue') },
      { path: 'inventory', name: 'Inventory', component: () => import('@/views/InventoryView.vue') },
      { path: 'costs', name: 'Costs', component: () => import('@/views/CostsView.vue') },
      { path: 'recipes', name: 'Recipes', component: () => import('@/views/RecipesView.vue') },
      { path: 'customers', name: 'Customers', component: () => import('@/views/CustomersView.vue') },
      { path: 'invoices', name: 'Invoices', component: () => import('@/views/InvoicesView.vue') },
      { path: 'invoices/create', name: 'InvoiceCreate', component: () => import('@/views/InvoiceFormView.vue') },
      { path: 'invoices/quotes', name: 'QuotationCreate', component: () => import('@/views/QuotesView.vue') },
      { path: 'invoices/:id', name: 'InvoiceDetail', component: () => import('@/views/InvoicePrintView.vue') },
      { path: 'expenses', name: 'Expenses', component: () => import('@/views/ExpensesView.vue') },
      { path: 'suppliers', name: 'Suppliers', component: () => import('@/views/SuppliersView.vue') },
      { path: 'reports', name: 'Reports', component: () => import('@/views/ReportsView.vue') },
      { path: 'users', name: 'Users', component: () => import('@/views/UsersView.vue') },
      { path: 'settings', name: 'Settings', component: () => import('@/views/SettingsView.vue') },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();
  auth.loadFromStorage();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return next('/login');
  if (to.meta.guest && auth.isAuthenticated) return next('/');
  next();
});

export default router;
