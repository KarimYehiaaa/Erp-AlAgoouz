# ERP-AlAgoouz Domain Context

## Organization

The system operates one commercial shop/location. It is not a multi-branch
tenant. The shop may contain multiple warehouses or stock locations.

## Warehouse

A warehouse is the operational access boundary for inventory, POS shifts,
stock movements, and warehouse-scoped reports. The current shop has a main
warehouse and a point-of-sale/store warehouse.

## Retail sale

The legacy persisted sale type "branch" means a retail/in-shop sale. It does
not mean an organizational branch and remains for data compatibility.

## Wholesale sale

A wholesale sale is a separate sales channel and may use customers, invoices,
and credit settlement.

## User access

Administrators can access all warehouses. Other users are assigned to a
warehouse when their role requires a narrow operational scope. The legacy
branch_id field is compatibility data and is not a separate business entity.

## Canonical language

Use “المحل” or “مبيعات المحل” for the physical shop and “المخزن” for stock
locations. Avoid presenting “فرع” as a selectable organizational unit.
