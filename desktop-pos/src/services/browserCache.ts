import { getBrowserQueueContext } from './browserQueue';

type CatalogKind = 'categories' | 'products' | 'customers';
const cacheKey = (kind: CatalogKind, context: string) =>
  `pos_cached_${kind}:${encodeURIComponent(context)}`;

export const readBrowserCache = (kind: CatalogKind, context = getBrowserQueueContext()): any[] => {
  if (context !== getBrowserQueueContext() || context.endsWith('::anonymous')) return [];
  try {
    const rows = JSON.parse(localStorage.getItem(cacheKey(kind, context)) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

export const writeBrowserCache = (
  kind: CatalogKind,
  rows: any[],
  context = getBrowserQueueContext(),
) => {
  if (context !== getBrowserQueueContext() || context.endsWith('::anonymous')) {
    throw new Error('تغير سياق الحساب أثناء حفظ البيانات المحلية');
  }
  localStorage.setItem(cacheKey(kind, context), JSON.stringify(rows));
};
