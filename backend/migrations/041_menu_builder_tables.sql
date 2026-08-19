-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 041: جداول موديول إدارة وتصميم المنيو (Menu Builder)
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. جدول المنيوهات الرئيسية
CREATE TABLE IF NOT EXISTS menus (
    id SERIAL PRIMARY KEY,
    title_ar VARCHAR(200) NOT NULL DEFAULT 'قائمة بن العجوز',
    subtitle_ar VARCHAR(300) DEFAULT 'أصل القهوة والتوليفات الفاخرة',
    theme VARCHAR(50) NOT NULL DEFAULT 'coffee-gold', -- coffee-gold, modern-dark, warm-cream
    logo_url TEXT,
    phone_primary VARCHAR(50) DEFAULT '01000000000',
    phone_secondary VARCHAR(50),
    address_ar TEXT DEFAULT 'جمهورية مصر العربية',
    facebook_handle VARCHAR(100) DEFAULT 'BinAlAgoouz',
    instagram_handle VARCHAR(100) DEFAULT 'binalagoouz',
    show_qr_code BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 2. جدول تصنيفات المنيو
CREATE TABLE IF NOT EXISTS menu_categories (
    id SERIAL PRIMARY KEY,
    menu_id INT NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    name_ar VARCHAR(150) NOT NULL,
    subtitle_ar VARCHAR(250),
    page_side VARCHAR(20) NOT NULL DEFAULT 'front', -- front (الصفحة الأولى), back (الصفحة الثانية)
    sort_order INT NOT NULL DEFAULT 0,
    icon_name VARCHAR(50) DEFAULT 'coffee',
    column_span INT NOT NULL DEFAULT 1, -- 1 أو 2 لملء العرض
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. جدول بنود وأصناف المنيو
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    menu_category_id INT NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE SET NULL,
    name_ar VARCHAR(200) NOT NULL,
    description_ar TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    price_secondary DECIMAL(10,2), -- سعر حجم مضاعف / دبل إن وجد
    unit_label_ar VARCHAR(50), -- مثل: ربع كيلو / كوب / سنجل / دبل
    is_featured BOOLEAN DEFAULT FALSE,
    is_new BOOLEAN DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- الفهارس لتحسين سرعة الجلب
CREATE INDEX IF NOT EXISTS idx_menu_categories_menu ON menu_categories(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(menu_category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_product ON menu_items(product_id);

-- بذر البيانات الافتراضية لمنيو أولي فاخر
DO $$
DECLARE
    v_menu_id INT;
    v_cat_blend INT;
    v_cat_origin INT;
    v_cat_spices INT;
    v_cat_hot INT;
    v_cat_cold INT;
    v_cat_extras INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM menus WHERE deleted_at IS NULL) THEN
        INSERT INTO menus (title_ar, subtitle_ar, theme, phone_primary, address_ar, facebook_handle, instagram_handle)
        VALUES ('بن العجوز', 'أصل القهوة والتوليفات الفاخرة منذ 1980', 'coffee-gold', '01012345678', 'الفرع الرئيسي - مصر', 'BinAlAgoouz', 'binalagoouz')
        RETURNING id INTO v_menu_id;

        -- الصفحة الأولى: الوجه (القهوة والتوليفات والبن)
        INSERT INTO menu_categories (menu_id, name_ar, subtitle_ar, page_side, sort_order, icon_name)
        VALUES (v_menu_id, 'توليفات بن العجوز الخاصة', 'توليفات معتقة ومحمصة بعناية فائقة', 'front', 1, 'star')
        RETURNING id INTO v_cat_blend;

        INSERT INTO menu_categories (menu_id, name_ar, subtitle_ar, page_side, sort_order, icon_name)
        VALUES (v_menu_id, 'أصناف البن الفاخر', 'أفضل حبوب البن المختارة عالمياً', 'front', 2, 'coffee')
        RETURNING id INTO v_cat_origin;

        INSERT INTO menu_categories (menu_id, name_ar, subtitle_ar, page_side, sort_order, icon_name)
        VALUES (v_menu_id, 'التحويجات والخلطات السرية', 'حبهان غواتيمالي، مستكة حرة، وزعفران', 'front', 3, 'sparkles')
        RETURNING id INTO v_cat_spices;

        -- بنود الصفحة الأولى
        INSERT INTO menu_items (menu_category_id, name_ar, description_ar, price, is_featured, sort_order)
        VALUES 
            (v_cat_blend, 'توليفة العجوز الملكية', 'خلطة أرابيكا ممتازة مع روبوستا معتقة وحبهان فستقي', 180.00, TRUE, 1),
            (v_cat_blend, 'توليفة السلطان الفاخرة', 'مزيج كولومبي برازيلي محمص بدرجة وسط غنية بالكريما', 160.00, FALSE, 2),
            (v_cat_blend, 'توليفة الصباح التركية', 'تحميص فاتح مع نكهة منعشة قوية', 140.00, FALSE, 3);

        INSERT INTO menu_items (menu_category_id, name_ar, description_ar, price, is_featured, sort_order)
        VALUES 
            (v_cat_origin, 'بن كولومبي سوبريمو', 'حموضة متوازنة وإيحاءات المكسرات والشوكولاتة', 190.00, TRUE, 1),
            (v_cat_origin, 'بن برازيلي سانتوس', 'قوام كامل، نكهة كلاسيكية ناعمة وبدون مرارة', 150.00, FALSE, 2),
            (v_cat_origin, 'بن يمني مطري أصيل', 'نكهة برية فريدة مع لمسات الفواكه المجففة', 280.00, TRUE, 3),
            (v_cat_origin, 'بن حبشي يرجاشيف', 'إيحاءات أزهار وياسمين بقوام خفيف وعطري', 210.00, FALSE, 4);

        INSERT INTO menu_items (menu_category_id, name_ar, description_ar, price, is_featured, sort_order)
        VALUES 
            (v_cat_spices, 'تحويجة العجوز الخصوصي (حبهان ومستكة)', 'خلطة البهارات الشرقية الفاخرة', 45.00, TRUE, 1),
            (v_cat_spices, 'تحويجة الهيل الأخضر الملكي', 'هيل غواتيمالي نخب أول مطحون طازج', 35.00, FALSE, 2),
            (v_cat_spices, 'إضافة المستكة الحرة والزعفران', 'لمسة ملكية تمنح الفنجان نكهة لا تُنسى', 40.00, FALSE, 3);

        -- الصفحة الثانية: الظهر (المشروبات والإضافات)
        INSERT INTO menu_categories (menu_id, name_ar, subtitle_ar, page_side, sort_order, icon_name)
        VALUES (v_menu_id, 'مشروبات القهوة الساخنة', 'فناجين تُحضر طازجة عند الطلب', 'back', 1, 'flame')
        RETURNING id INTO v_cat_hot;

        INSERT INTO menu_categories (menu_id, name_ar, subtitle_ar, page_side, sort_order, icon_name)
        VALUES (v_menu_id, 'المشروبات الباردة والآيس كوفي', 'انتعاش بنكهات القهوة المركزة', 'back', 2, 'snowflake')
        RETURNING id INTO v_cat_cold;

        INSERT INTO menu_categories (menu_id, name_ar, subtitle_ar, page_side, sort_order, icon_name)
        VALUES (v_menu_id, 'الإضافات والمشروبات الخاصة', 'مشروبات دافئة ونكهات مميزة', 'back', 3, 'heart')
        RETURNING id INTO v_cat_extras;

        -- بنود الصفحة الثانية
        INSERT INTO menu_items (menu_category_id, name_ar, description_ar, price, price_secondary, is_featured, sort_order)
        VALUES 
            (v_cat_hot, 'فنجان قهوة تركي سادة / محوج', 'يُحضر على الرمالة بالطريقة التقليدية', 35.00, 45.00, TRUE, 1),
            (v_cat_hot, 'قهوة فرنساوي بالحليب البلدي', 'قهوة خفيفة مع حليب ساخن وكريمة غنية', 50.00, 60.00, FALSE, 2),
            (v_cat_hot, 'إسبريسو سينجل / دبل', 'شوت مركز من حبوبنا الطازجة', 40.00, 55.00, FALSE, 3),
            (v_cat_hot, 'كابتشينو / لاتيه كلاسيك', 'إسبريسو مع فوم الحليب المخملي اللذيذ', 65.00, 75.00, FALSE, 4);

        INSERT INTO menu_items (menu_category_id, name_ar, description_ar, price, is_featured, sort_order)
        VALUES 
            (v_cat_cold, 'آيس سبانش لاتيه', 'حليب مكثف محلى مع إسبريسو وحليب مثلج', 75.00, TRUE, 1),
            (v_cat_cold, 'فرابتشينو كراميل / موكا', 'قهوة مثلجة ممزوجة مع صوص الكراميل والكرانش', 80.00, TRUE, 2),
            (v_cat_cold, 'آيس كوفي بن العجوز المركز', 'قهوة مثلجة منعشة غنية بالكافيين', 60.00, FALSE, 3);

        INSERT INTO menu_items (menu_category_id, name_ar, description_ar, price, is_featured, sort_order)
        VALUES 
            (v_cat_extras, 'شاي كرك بالهيل والزعفران', 'شاي هندي غني بالحليب والتوابل العطرية', 45.00, FALSE, 1),
            (v_cat_extras, 'سحلب فاخر بالمكسرات والعسل', 'مشروب شتوي دافئ ومغذي', 55.00, FALSE, 2),
            (v_cat_extras, 'هوت شوكليت بلجيكي بالمارشميلو', 'شوكولاتة داكنة ذائبة مع الحليب الساخن', 65.00, FALSE, 3);
    END IF;
END $$;
