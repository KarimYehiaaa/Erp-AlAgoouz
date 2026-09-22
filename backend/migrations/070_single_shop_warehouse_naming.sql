-- 070: Use warehouse terminology for the single-shop workflow graph.
-- Keep the historical automation aliases in application code so existing logs
-- and saved automation requests remain readable and executable.

UPDATE workflows_nodes
SET label = 'Warehouse Stock Update',
    label_ar = 'تحديث مخزون المخزن',
    updated_at = NOW()
WHERE label = 'Branch Stock Update';

UPDATE workflows_edges
SET label = 'تحديث رصيد المخزن'
WHERE label = 'تحديث رصيد الفرع';
