# ERP-AlAgoouz Domain Context

## Organization

The system operates one commercial shop/location. It is not a multi-branch
tenant. The shop may contain multiple warehouses or stock locations.

## Warehouse

A warehouse is the operational access boundary for inventory, POS shifts,
stock movements, and warehouse-scoped reports. The current shop has a main
warehouse and a point-of-sale/store warehouse.

## Retail sale

A retail sale is made to a walk-in customer at the shop. It is distinct from
wholesale sales, and is not an organizational branch.

## Wholesale sale

A wholesale sale is a separate sales channel and may use customers, invoices,
and credit settlement.

## User access

Administrators can access all warehouses. Other users are assigned to a
warehouse when their role requires a narrow operational scope.

## Canonical language

Use “المحل” or “مبيعات المحل” for the physical shop and “المخزن” for stock
locations. Avoid presenting “فرع” as a selectable organizational unit.
