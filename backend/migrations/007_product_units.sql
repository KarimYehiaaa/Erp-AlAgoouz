-- وحدات القياس — جدول مستقل مثل product_categories
CREATE TABLE IF NOT EXISTS product_units (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(50) NOT NULL UNIQUE,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- نقل الوحدات الموجودة من جدول settings إلى الجدول الجديد
INSERT INTO product_units (name_ar, sort_order)
SELECT DISTINCT trim(u.unit_name::text), ROW_NUMBER() OVER () - 1
FROM (
    SELECT jsonb_array_elements_text(value) AS unit_name
    FROM settings
    WHERE key = 'units'
      AND jsonb_typeof(value) = 'array'
) u
WHERE trim(u.unit_name::text) <> ''
ON CONFLICT (name_ar) DO NOTHING;

-- نضيف الوحدات الافتراضية لو مفيش حاجة
INSERT INTO product_units (name_ar, sort_order) VALUES
    ('قطعة', 0),
    ('كجم', 1),
    ('جرام', 2),
    ('لتر', 3),
    ('مل', 4),
    ('علبة', 5),
    ('كرتون', 6),
    ('كيس', 7)
ON CONFLICT (name_ar) DO NOTHING;
