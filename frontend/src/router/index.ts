import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { navigationGuard } from './guards';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guest: true },
  },
  {
    path: '/menu',
    name: 'DigitalMenu',
    component: () => import('@/views/DigitalMenuView.vue'),
    meta: { public: true },
  },
  {
    path: '/mobile',
    name: 'ManagerMobile',
    component: () => import('@/views/ManagerMobileView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/manager-mobile',
    redirect: '/mobile',
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      // 0. Dashboard & POS
      { path: '', name: 'Dashboard', component: () => import('@/views/DashboardView.vue') },
      {
        path: 'pos',
        name: 'POS',
        component: () => import('@/views/PosView.vue'),
        meta: { permission: 'pos.view' },
      },
      // 1. Sales & Customers Hub
      {
        path: 'sales',
        name: 'Sales',
        component: () => import('@/views/SalesView.vue'),
        meta: { permission: 'sales.view' },
      },
      {
        path: 'customers',
        redirect: () => ({ path: '/sales', query: { tab: 'customers' } }),
      },
      {
        path: 'invoices',
        redirect: () => ({ path: '/sales', query: { tab: 'invoices' } }),
      },
      {
        path: 'invoices/create',
        name: 'InvoiceCreate',
        component: () => import('@/views/InvoiceFormView.vue'),
        meta: { permission: 'invoices.view' },
      },
      {
        path: 'invoices/:id/edit',
        name: 'InvoiceEdit',
        component: () => import('@/views/InvoiceFormView.vue'),
        meta: { permission: 'invoices.view' },
      },
      {
        path: 'invoices/quotes',
        name: 'QuotationCreate',
        component: () => import('@/views/QuotesView.vue'),
        meta: { permission: 'invoices.view' },
      },
      {
        path: 'invoices/:id',
        name: 'InvoiceDetail',
        component: () => import('@/views/InvoicePrintView.vue'),
        meta: { permission: 'invoices.view' },
      },

      // 2. Inventory Hub
      {
        path: 'inventory',
        name: 'Inventory',
        component: () => import('@/views/InventoryView.vue'),
        meta: { permission: 'inventory.view' },
      },
      {
        path: 'stocktakes',
        redirect: () => ({ path: '/inventory', query: { tab: 'stocktakes' } }),
      },
      {
        path: 'stocktakes/:id',
        name: 'StocktakeDetails',
        component: () => import('@/views/StocktakeFormView.vue'),
        meta: { permission: 'inventory.view' },
      },

      // 3. Products, Recipes & Costs Hub
      {
        path: 'products',
        name: 'Products',
        component: () => import('@/views/ProductsView.vue'),
        meta: { permission: 'products.view' },
      },
      {
        path: 'recipes',
        redirect: () => ({ path: '/products', query: { tab: 'recipes' } }),
      },
      {
        path: 'costs',
        redirect: () => ({ path: '/products', query: { tab: 'costs' } }),
      },
      {
        path: 'menu-builder',
        redirect: () => ({ path: '/products', query: { tab: 'menu-builder' } }),
      },

      // 4. Finance, Purchases & Suppliers Hub
      {
        path: 'purchases',
        name: 'Purchases',
        component: () => import('@/views/PurchasesAndExpensesView.vue'),
        meta: { permission: ['inventory.view', 'expenses.view'] },
      },
      {
        path: 'expenses',
        redirect: () => ({ path: '/purchases', query: { tab: 'expenses' } }),
      },
      {
        path: 'suppliers',
        redirect: () => ({ path: '/purchases', query: { tab: 'suppliers' } }),
      },
      {
        path: 'partners',
        redirect: () => ({ path: '/purchases', query: { tab: 'partners' } }),
      },

      // 5. Analytics, Reports & AI Hub
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('@/views/ReportsView.vue'),
        meta: { permission: 'reports.view' },
      },
      {
        path: 'operations',
        redirect: () => ({ path: '/reports', query: { tab: 'operations' } }),
      },
      {
        path: 'forecasting',
        redirect: () => ({ path: '/reports', query: { tab: 'forecasting' } }),
      },
      {
        path: 'copilot',
        redirect: () => ({ path: '/reports', query: { tab: 'copilot' } }),
      },
      {
        path: 'automation',
        redirect: () => ({ path: '/reports', query: { tab: 'automation' } }),
      },

      // 6. Settings & Administration Hub
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { permission: 'settings.view' },
      },
      {
        path: 'hr',
        redirect: () => ({ path: '/settings', query: { tab: 'hr' } }),
      },
      {
        path: 'users',
        redirect: () => ({ path: '/settings', query: { tab: 'users' } }),
      },
      {
        path: 'admin-dashboard',
        redirect: () => ({ path: '/settings', query: { tab: 'admin' } }),
      },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(navigationGuard);

export default router;
