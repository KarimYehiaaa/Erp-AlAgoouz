# Frontend Tailwind Migration

## Backup

Backup created before Tailwind changes:

`D:\AlAgoouz System\AlAgoouz-erp\backups\pre-tailwind-20260603-034054`

The backup contains `frontend/src`, `frontend/package.json`, `frontend/package-lock.json`, and `frontend/vite.config.js`.

## Migration Rules

1. Keep the existing SCSS variables as the source of truth for colors, radii, spacing, shadows, RTL, and themes.
2. Use Tailwind utilities for layout, spacing, responsive behavior, and repeated UI structure.
3. Use shared `ui-*` component classes for common controls and surfaces.
4. Convert shared shell components before feature pages.
5. Convert feature pages one page at a time, then remove the unused scoped CSS for that page.
6. After each page conversion, run `npm run build` and visually check desktop and mobile.
7. Avoid touching Arabic copy while migrating styles.

## Completed In This Pass

1. Installed Tailwind, PostCSS, and Autoprefixer.
2. Added Tailwind configuration mapped to the current design tokens.
3. Added Tailwind layers to `frontend/src/styles/main.scss`.
4. Added shared classes: `ui-panel`, `ui-glass-panel`, `ui-icon-button`, `ui-search-input`, `ui-primary-gradient`, and `ui-surface-gradient`.
5. Migrated the application shell foundation:
   - `MainLayout.vue`
   - `AppSidebar.vue`
   - `AppNavbar.vue`
   - `StatCard.vue`

## Recommended Page Order

1. `DashboardView.vue`
2. `ProductsView.vue`
3. `InventoryView.vue`
4. `SalesView.vue`
5. `BranchSalesView.vue`
6. `InvoicesView.vue`
7. `CustomersView.vue`
8. Remaining admin pages

## Verification

Run:

```bash
cd frontend
npm run build
```

Then open:

`http://127.0.0.1:5173/login`

Check:

1. Desktop login layout.
2. Mobile login layout.
3. Authenticated app shell with a real backend session.
4. RTL and dark mode.
