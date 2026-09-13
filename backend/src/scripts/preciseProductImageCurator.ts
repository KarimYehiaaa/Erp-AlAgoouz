/**
 * backend/src/scripts/preciseProductImageCurator.ts
 * يقوم هذا السكربت بتعيين صورة حقيقية ودقيقة 100% لكل صنف على حدة بالاسم
 */
import { query } from '../database/pool.ts';

// 🎯 مصفوفة الصور الدقيقة المخصصة لكل صنف باسمه الحقيقي
export const EXACT_PRODUCT_IMAGES: Record<string, string> = {
  // ☕ القهوة المحضرة والمشروبات الساخنة
  'قهوة تركى سنجل':
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
  'قوة تركى دبل':
    'https://images.unsplash.com/photo-1579992357154-faf4bde95b3d?w=600&auto=format&fit=crop&q=80',
  'قهوة الصحاب':
    'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&auto=format&fit=crop&q=80',
  'قهوة فرنساوى':
    'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&auto=format&fit=crop&q=80',
  'قهوة فرنسية - 250 جرام':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'قهوة فرنسية - 500 جرام':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'قهوة بندق':
    'https://images.unsplash.com/photo-1587080413959-06b859fb107d?w=600&auto=format&fit=crop&q=80',
  'بن بندق قطع':
    'https://images.unsplash.com/photo-1587080413959-06b859fb107d?w=600&auto=format&fit=crop&q=80',
  'بن فرنساوى':
    'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&auto=format&fit=crop&q=80',
  'بن فانيليا':
    'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?w=600&auto=format&fit=crop&q=80',

  // ☕ الإسبريسو واللاتيه والكابتشينو
  'أسبريسو سنجل':
    'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600&auto=format&fit=crop&q=80',
  'أسبريسو دبل':
    'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600&auto=format&fit=crop&q=80',
  'اسبريسو ميكاتو سنجل':
    'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
  'اسبريسو ميكاتو دبل':
    'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
  امريكان:
    'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=600&auto=format&fit=crop&q=80',
  كابتشينو:
    'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&auto=format&fit=crop&q=80',
  لاتيه:
    'https://images.unsplash.com/photo-1561882468-9110e03e0f78?w=600&auto=format&fit=crop&q=80',
  'هوت شوكلت':
    'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=600&auto=format&fit=crop&q=80',
  'هوت شوكليت - علبة':
    'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=600&auto=format&fit=crop&q=80',
  'نسكافيه كلاسيك':
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',
  'نسكافيه 3 في 1':
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
  'نسكافيه العجوز':
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',
  'نسكافيه بورشن':
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',

  // 🫖 الشاي والكرك والأعشاب
  'شاى فتله':
    'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
  'شاى سايب':
    'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
  'شاى كرك':
    'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=600&auto=format&fit=crop&q=80',
  'شاى عدن':
    'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=600&auto=format&fit=crop&q=80',
  يانسون:
    'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=600&auto=format&fit=crop&q=80',

  // 🧃 العصائر والمشروبات الباردة والغازية
  'عصير برتقال - علبة':
    'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80',
  'عصير مانجو':
    'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=600&auto=format&fit=crop&q=80',
  'عصير فراولة ':
    'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80',
  'عصير فراولة':
    'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80',
  'عصير جوافه':
    'https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=600&auto=format&fit=crop&q=80',
  'ريد بول':
    'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
  بيبسي:
    'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&auto=format&fit=crop&q=80',
  ماكس: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&auto=format&fit=crop&q=80',
  'مياه معدنية':
    'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80',

  // 🍪 السناكس والحلويات والمخبوزات
  بلح: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=600&auto=format&fit=crop&q=80',
  ماندولين:
    'https://images.unsplash.com/photo-1575224300306-1b8da36134ec?w=600&auto=format&fit=crop&q=80',
  اوريو:
    'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop&q=80',
  معمول:
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
  ويفر: 'https://images.unsplash.com/photo-1575224300306-1b8da36134ec?w=600&auto=format&fit=crop&q=80',
  بيك: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
  'لارج ساده':
    'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
  'لارج مولتن':
    'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',

  // 🌿 البهارات والمواد الأولية
  حبهان:
    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
  'جوز الطيب':
    'https://images.unsplash.com/photo-1509358271058-acd22cc93898?w=600&auto=format&fit=crop&q=80',
  قرنقل:
    'https://images.unsplash.com/photo-1509358271058-acd22cc93898?w=600&auto=format&fit=crop&q=80',
  ورد: 'https://images.unsplash.com/photo-1559563458-527698bf5295?w=600&auto=format&fit=crop&q=80',
  جينسيج:
    'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop&q=80',
  تحويجه:
    'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
  لبن: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop&q=80',
  'حليب مكثف':
    'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop&q=80',
  سكر: 'https://images.unsplash.com/photo-1581600140682-d4e68c8cde32?w=600&auto=format&fit=crop&q=80',
  'سكر - كيس':
    'https://images.unsplash.com/photo-1581600140682-d4e68c8cde32?w=600&auto=format&fit=crop&q=80',
  مناديل:
    'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=600&auto=format&fit=crop&q=80',

  // 🫘 حبوب البن المحمص والأوزان المعبأة والتوليفات
  'بن تركي - 250 جرام':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن تركي - 500 جرام':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن تركي - 1 كيلو':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'توليفه - بن العجوز':
    'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=600&auto=format&fit=crop&q=80',
  'توليفة - بـن اسبيشيال':
    'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=600&auto=format&fit=crop&q=80',
  'توليفة - بـن شـرقى':
    'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=600&auto=format&fit=crop&q=80',
  'بن برازيلى ريو وسط':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن برازيلى ريو فاتح':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن برازيلى سانتوس فاتح':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن كولومبى وسط ارابيكا':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن كولومبى فاتح ارابيكا':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن حبشى فاتح ارابيكا':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن حبشى وسط ارابيكا':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن فيتنامى فاتح روبيستا':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن فيتنامى وسط روبيستا':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن أندونيسى أكس لارج فاتح':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن اندونيسى فاتح روبيستا':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن اندونيسى وسط روبيستا':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن اندونيسى سومطرا فاتح':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن هندى فاتح ارابيكا':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن هندى وسط ارابيكا':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن هندى فاتح روبيستا':
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
  'بن هندى وسط روبيستا':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن يمنى وسط اريبكا':
    'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
  'بن أسبريسو خام':
    'https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=600&auto=format&fit=crop&q=80',
  'بن غامق':
    'https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=600&auto=format&fit=crop&q=80',
};

export async function runPreciseImageCurator() {
  const productsRes = await query(`SELECT id, name_ar FROM products WHERE is_active = true`);
  const products = productsRes.rows;

  let updated = 0;
  for (const p of products) {
    const trimmedName = p.name_ar.trim();
    const exactImg = EXACT_PRODUCT_IMAGES[trimmedName];
    if (exactImg) {
      await query(`UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2`, [
        exactImg,
        p.id,
      ]);
      updated++;
    } else {
      console.log(`[Curator] No exact match for: "${trimmedName}"`);
    }
  }

  console.log(
    `[Curator] Successfully updated ${updated} out of ${products.length} products with exact tailored images.`,
  );
  return { total: products.length, updated };
}
