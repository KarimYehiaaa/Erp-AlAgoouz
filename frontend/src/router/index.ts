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
    path: '/qr-menu',
    redirect: '/menu',
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', component: () => import('@/views/DashboardView.vue') },
      {
        path: 'copilot',
        name: 'AiCopilot',
        component: () => import('@/views/AiCopilotView.vue'),
        meta: { permission: 'dashboard.view' },
      },
      {
        path: 'branch-sales',
        name: 'BranchSales',
        component: () => import('@/views/BranchSalesView.vue'),
      },
      { path: 'sales', name: 'Sales', component: () => import('@/views/SalesView.vue') },
      { path: 'pos', redirect: '/branch-sales' },
      {
        path: 'products',
        name: 'Products',
        component: () => import('@/views/ProductsView.vue'),
        meta: { permission: 'products.view' },
      },
      {
        path: 'purchases',
        name: 'Purchases',
        component: () => import('@/views/PurchasesAndExpensesView.vue'),
        meta: { permission: ['inventory.view', 'expenses.view'] },
      },
      {
        path: 'inventory',
        name: 'Inventory',
        component: () => import('@/views/InventoryView.vue'),
        meta: { permission: 'inventory.view' },
      },
      {
        path: 'stocktakes',
        name: 'Stocktakes',
        component: () => import('@/views/StocktakesView.vue'),
        meta: { permission: 'inventory.view' },
      },
      {
        path: 'stocktakes/:id',
        name: 'StocktakeDetails',
        component: () => import('@/views/StocktakeFormView.vue'),
        meta: { permission: 'inventory.view' },
      },
      {
        path: 'costs',
        name: 'Costs',
        component: () => import('@/views/CostsView.vue'),
        meta: { permission: 'recipes.view' },
      },
      {
        path: 'recipes',
        name: 'Recipes',
        component: () => import('@/views/RecipesView.vue'),
        meta: { permission: 'recipes.view' },
      },
      {
        path: 'menu-builder',
        name: 'MenuBuilder',
        component: () => import('@/views/MenuBuilderView.vue'),
        meta: { permission: 'products.view' },
      },
      {
        path: 'customers',
        name: 'Customers',
        component: () => import('@/views/CustomersView.vue'),
        meta: { permission: 'customers.view' },
      },
      {
        path: 'invoices',
        name: 'Invoices',
        component: () => import('@/views/InvoicesView.vue'),
        meta: { permission: 'invoices.view' },
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
      { path: 'expenses', redirect: '/purchases?tab=expenses' },
      {
        path: 'suppliers',
        name: 'Suppliers',
        component: () => import('@/views/SuppliersView.vue'),
        meta: { permission: 'suppliers.view' },
      },
      {
        path: 'partners',
        name: 'Partners',
        component: () => import('@/views/PartnersView.vue'),
        meta: { permission: 'reports.view' },
      },
      {
        path: 'hr',
        name: 'HR',
        component: () => import('@/views/HrView.vue'),
        meta: { permission: 'hr.view' },
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('@/views/ReportsView.vue'),
        meta: { permission: 'reports.view' },
      },
      {
        path: 'operations',
        name: 'Operations',
        component: () => import('@/views/OperationsView.vue'),
        meta: { permission: 'reports.view' },
      },
      {
        path: 'forecasting',
        name: 'Forecasting',
        component: () => import('@/views/ForecastingView.vue'),
        meta: { permission: 'reports.view' },
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/UsersView.vue'),
        meta: { permission: 'users.view' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { permission: 'settings.view' },
      },
      {
        path: 'automation',
        name: 'AutomationGraph',
        component: () => import('@/views/AutomationGraphView.vue'),
        meta: { permission: 'automation.view' },
      },
      {
        path: 'admin-dashboard',
        name: 'AdminDashboard',
        component: () => import('@/views/AdminDashboardView.vue'),
        meta: { requireAdmin: true },
      },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(navigationGuard);

export default router;
