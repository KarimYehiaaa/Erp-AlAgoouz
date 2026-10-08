export const buildProductWarehouseStocks = (
  warehouses: readonly { id: number }[],
  details: readonly { warehouse_id: number; quantity: number | string | null }[] = [],
): Record<string, number> => {
  const stocks: Record<string, number> = {};
  for (const warehouse of warehouses) stocks[warehouse.id] = 0;
  for (const item of details) {
    if (Object.prototype.hasOwnProperty.call(stocks, item.warehouse_id))
      stocks[item.warehouse_id] = (stocks[item.warehouse_id] ?? 0) + Number(item.quantity || 0);
  }
  for (const key of Object.keys(stocks)) stocks[key] = Math.round((stocks[key] ?? 0) * 1000) / 1000;
  return stocks;
};

export const changedProductWarehouseStocks = (
  stocks: Record<string, number>,
  original: Record<string, number>,
): Record<string, number> => {
  const changed: Record<string, number> = {};
  for (const [warehouseId, quantity] of Object.entries(stocks)) {
    if (Number(quantity) !== Number(original[warehouseId] ?? 0)) changed[warehouseId] = quantity;
  }
  return changed;
};
