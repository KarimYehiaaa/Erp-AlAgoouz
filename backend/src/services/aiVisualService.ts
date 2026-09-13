/**
 * backend/src/services/aiVisualService.ts — موظف الذكاء الاصطناعي لتنسيق صور المنتجات
 * يقوم بتحليل اسم الصنف وتصنيفه وتوليد/تعيين صورة احترافية عالية الدقة مناسبة للمنتج
 */
import { query } from '../database/pool.ts';

export interface ProductVisualMatch {
  id: number;
  name_ar: string;
  category_id: number;
  matched_image_url: string;
  tag: string;
}

export class AiVisualService {
  /**
   * خريطة الصور الاحترافية عالية الجودة (HD Food & Beverage Photography)
   */
  public static readonly CURATED_IMAGES: Record<string, string> = {
    // ☕ 1. قهوة وإسبريسو ومشروبات ساخنة
    turkish_coffee:
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    espresso_single:
      'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600&auto=format&fit=crop&q=80',
    espresso_double:
      'https://images.unsplash.com/photo-1579992357154-faf4bde95b3d?w=600&auto=format&fit=crop&q=80',
    macchiato:
      'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
    cappuccino:
      'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&auto=format&fit=crop&q=80',
    latte:
      'https://images.unsplash.com/photo-1561882468-9110e03e0f78?w=600&auto=format&fit=crop&q=80',
    americano:
      'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=600&auto=format&fit=crop&q=80',
    french_coffee:
      'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&auto=format&fit=crop&q=80',
    hazelnut_coffee:
      'https://images.unsplash.com/photo-1587080413959-06b859fb107d?w=600&auto=format&fit=crop&q=80',
    hot_chocolate:
      'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=600&auto=format&fit=crop&q=80',
    nescafe:
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',

    // 🍵 2. شاي وأعشاب
    black_tea:
      'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
    karak_tea:
      'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=600&auto=format&fit=crop&q=80',
    herbal_anise:
      'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=600&auto=format&fit=crop&q=80',

    // 🧃 3. عصائر طازجة ومشروبات باردة
    mango_juice:
      'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=600&auto=format&fit=crop&q=80',
    strawberry_juice:
      'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80',
    guava_juice:
      'https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=600&auto=format&fit=crop&q=80',
    red_bull:
      'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
    pepsi_soda:
      'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&auto=format&fit=crop&q=80',
    mineral_water:
      'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80',

    // 🍪 4. حلويات ومخبوزات وسناكس
    dates:
      'https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=600&auto=format&fit=crop&q=80',
    oreo_cookies:
      'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop&q=80',
    maamoul_bakery:
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
    molten_cake:
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
    wafer_chocolate:
      'https://images.unsplash.com/photo-1575224300306-1b8da36134ec?w=600&auto=format&fit=crop&q=80',

    // 🫘 5. حبوب بن محمص ومطحون وخام
    coffee_beans_light:
      'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
    coffee_beans_medium:
      'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
    coffee_beans_dark:
      'https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=600&auto=format&fit=crop&q=80',
    coffee_blend_special:
      'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=600&auto=format&fit=crop&q=80',

    // 🌿 6. بهارات وتحويجة ومستلزمات
    cardamom_spices:
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
    nutmeg_cloves:
      'https://images.unsplash.com/photo-1509358271058-acd22cc93898?w=600&auto=format&fit=crop&q=80',
    fresh_milk:
      'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop&q=80',
    sugar_packets:
      'https://images.unsplash.com/photo-1581600140682-d4e68c8cde32?w=600&auto=format&fit=crop&q=80',
    napkins:
      'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=600&auto=format&fit=crop&q=80',
  };

  /**
   * تحليل الاسم العربي للصنف واختيار الصورة الأنسب بذكاء
   */
  public static matchImageForProduct(
    name: string,
    categoryId?: number,
  ): { imageUrl: string; tag: string } {
    const n = (name || '').toLowerCase().trim();

    // 1. قهوة ومشروبات إسبريسو
    if (n.includes('تركي') || n.includes('تركى')) {
      return { imageUrl: this.CURATED_IMAGES.turkish_coffee, tag: 'قهوة تركية فاخرة' };
    }
    if (n.includes('فرنساو') || n.includes('فرنساوي')) {
      return { imageUrl: this.CURATED_IMAGES.french_coffee, tag: 'قهوة فرنساوي بالحليب' };
    }
    if (n.includes('بندق')) {
      return { imageUrl: this.CURATED_IMAGES.hazelnut_coffee, tag: 'قهوة بالبندق المحمص' };
    }
    if (n.includes('ميكاتو') || n.includes('ماكياتو')) {
      return { imageUrl: this.CURATED_IMAGES.macchiato, tag: 'إسبريسو ماكياتو' };
    }
    if (n.includes('دبل') && n.includes('سبريسو')) {
      return { imageUrl: this.CURATED_IMAGES.espresso_double, tag: 'دبل إسبريسو' };
    }
    if (n.includes('سبريسو') || n.includes('اسبرسو')) {
      return { imageUrl: this.CURATED_IMAGES.espresso_single, tag: 'إسبريسو سنجل' };
    }
    if (n.includes('كابتشينو')) {
      return { imageUrl: this.CURATED_IMAGES.cappuccino, tag: 'كابتشينو كريمي' };
    }
    if (n.includes('لاتيه')) {
      return { imageUrl: this.CURATED_IMAGES.latte, tag: 'كافيه لاتيه' };
    }
    if (n.includes('امريكان') || n.includes('أمريكان')) {
      return { imageUrl: this.CURATED_IMAGES.americano, tag: 'قهوة أمريكانو' };
    }
    if (n.includes('هوت شوكلت') || n.includes('شوكولات') || n.includes('كاكاو')) {
      return { imageUrl: this.CURATED_IMAGES.hot_chocolate, tag: 'هوت شوكليت بلجيكي' };
    }
    if (n.includes('نسكافيه')) {
      return { imageUrl: this.CURATED_IMAGES.nescafe, tag: 'نسكافيه العجوز' };
    }
    if (n.includes('صحاب') || n.includes('الصحاب')) {
      return { imageUrl: this.CURATED_IMAGES.turkish_coffee, tag: 'قهوة الصحاب' };
    }

    // 2. شاي وأعشاب
    if (n.includes('كرك') || n.includes('عدن')) {
      return { imageUrl: this.CURATED_IMAGES.karak_tea, tag: 'شاي كرك عدني' };
    }
    if (n.includes('شاى') || n.includes('شاي')) {
      return { imageUrl: this.CURATED_IMAGES.black_tea, tag: 'شاي أحمر فاخر' };
    }
    if (n.includes('يانسون') || n.includes('نعناع') || n.includes('اعشاب') || n.includes('أعشاب')) {
      return { imageUrl: this.CURATED_IMAGES.herbal_anise, tag: 'يانسون وأعشاب طبيعية' };
    }

    // 3. عصائر ومشروبات باردة
    if (n.includes('مانجو') || n.includes('مانجا')) {
      return { imageUrl: this.CURATED_IMAGES.mango_juice, tag: 'عصير مانجو فريش' };
    }
    if (n.includes('فراول') || n.includes('فراولة')) {
      return { imageUrl: this.CURATED_IMAGES.strawberry_juice, tag: 'عصير فراولة طبيعي' };
    }
    if (n.includes('جواف') || n.includes('جوافة')) {
      return { imageUrl: this.CURATED_IMAGES.guava_juice, tag: 'عصير جوافة فريش' };
    }
    if (n.includes('ريد بول') || n.includes('ريدبول') || n.includes('طاقة')) {
      return { imageUrl: this.CURATED_IMAGES.red_bull, tag: 'مشروب طاقة ريد بول' };
    }
    if (n.includes('بيبسي') || n.includes('كولا') || n.includes('صودا') || n.includes('ماكس')) {
      return { imageUrl: this.CURATED_IMAGES.pepsi_soda, tag: 'مشروب غازي مثلج' };
    }
    if (n.includes('مياه') || n.includes('ماي') || n.includes('ميه')) {
      return { imageUrl: this.CURATED_IMAGES.mineral_water, tag: 'مياه معدنية نقية' };
    }

    // 4. حلويات ومخبوزات
    if (n.includes('بلح') || n.includes('تمر')) {
      return { imageUrl: this.CURATED_IMAGES.dates, tag: 'بلح وتمر مجدول' };
    }
    if (n.includes('اوريو') || n.includes('أوريو')) {
      return { imageUrl: this.CURATED_IMAGES.oreo_cookies, tag: 'بسكويت أوريو' };
    }
    if (n.includes('معمول')) {
      return { imageUrl: this.CURATED_IMAGES.maamoul_bakery, tag: 'معمول فاخر' };
    }
    if (n.includes('مولتن') || n.includes('كيك') || n.includes('شوكولاته')) {
      return { imageUrl: this.CURATED_IMAGES.molten_cake, tag: 'مولتن لافا كيك' };
    }
    if (
      n.includes('ويفر') ||
      n.includes('ماندولين') ||
      n.includes('بيك') ||
      n.includes('لارج ساده')
    ) {
      return { imageUrl: this.CURATED_IMAGES.wafer_chocolate, tag: 'ويفر وشوكولاتة سناك' };
    }

    // 5. بهارات ومواد خام
    if (n.includes('حبهان') || n.includes('هيل')) {
      return { imageUrl: this.CURATED_IMAGES.cardamom_spices, tag: 'حبهان أخضر ممتاز' };
    }
    if (
      n.includes('جوز الطيب') ||
      n.includes('قرنفل') ||
      n.includes('جينسيج') ||
      n.includes('تحويج') ||
      n.includes('ورد')
    ) {
      return { imageUrl: this.CURATED_IMAGES.nutmeg_cloves, tag: 'بهارات وتحويجة العجوز' };
    }
    if (n.includes('لبن') || n.includes('حليب')) {
      return { imageUrl: this.CURATED_IMAGES.fresh_milk, tag: 'حليب طبيعي طازج' };
    }
    if (n.includes('سكر')) {
      return { imageUrl: this.CURATED_IMAGES.sugar_packets, tag: 'سكر نقي' };
    }
    if (n.includes('مناديل')) {
      return { imageUrl: this.CURATED_IMAGES.napkins, tag: 'مناديل ورقية' };
    }

    // 6. حبوب بن وتوليفات
    if (n.includes('غامق') || n.includes('محروق')) {
      return { imageUrl: this.CURATED_IMAGES.coffee_beans_dark, tag: 'بن محمص غامق' };
    }
    if (n.includes('توليف') || n.includes('اسبيشيال') || n.includes('شرقى') || n.includes('شرقي')) {
      return { imageUrl: this.CURATED_IMAGES.coffee_blend_special, tag: 'توليفة بن العجوز الخاصة' };
    }
    if (n.includes('فاتح')) {
      return { imageUrl: this.CURATED_IMAGES.coffee_beans_light, tag: 'بن محمص فاتح' };
    }
    if (
      n.includes('بن') ||
      n.includes('ارابيكا') ||
      n.includes('روبيستا') ||
      n.includes('هندى') ||
      n.includes('يمنى') ||
      n.includes('برازيلي')
    ) {
      return { imageUrl: this.CURATED_IMAGES.coffee_beans_medium, tag: 'حبوب بن ممتازة' };
    }

    // Default Fallback
    return { imageUrl: this.CURATED_IMAGES.coffee_blend_special, tag: 'صنف بن العجوز' };
  }

  /**
   * تشغيل مهمة التعيين التلقائي لجميع الأصناف في قاعدة البيانات
   */
  public static async autoAssignAllProductImages(): Promise<{ total: number; updated: number }> {
    const productsRes = await query(
      `SELECT id, name_ar, category_id, image_url FROM products WHERE is_active = true`,
    );
    const products = productsRes.rows;

    let updated = 0;
    for (const p of products) {
      const match = this.matchImageForProduct(p.name_ar, p.category_id);
      if (match.imageUrl) {
        await query(`UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2`, [
          match.imageUrl,
          p.id,
        ]);
        updated++;
      }
    }

    return { total: products.length, updated };
  }
}
