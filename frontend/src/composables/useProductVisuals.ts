/**
 * useProductVisuals — محرك وموظف الذكاء الاصطناعي لتنسيق صور المنتجات والأقسام
 * يربط كل صنف بصورته الحقيقية المطابقة 100% لاسمه
 */

export interface ProductVisual {
  icon: string;
  colorTheme: string;
  badge?: string;
  categoryEmoji: string;
  cardClass: string;
  iconBgClass: string;
  badgeClass: string;
  glowColor: string;
  accentColor: string;
  threeDImage: string;
}

export interface CategoryVisual {
  icon: string;
  emoji?: string;
  theme?: string;
  cardClass: string;
  iconBgClass: string;
  image: string;
}

export interface ColorThemeDefinition {
  id: string;
  name: string;
  accent: string;
  accentLight: string;
  glow: string;
  bgLight: string;
  bgDark: string;
  iconColorLight: string;
  iconColorDark: string;
  badgeBg: string;
  badgeText: string;
}

export const PRODUCT_THEMES: Record<string, ColorThemeDefinition> = {
  espresso: {
    id: 'espresso',
    name: 'إسبريسو وقهوة داكنة',
    accent: '#8a572a',
    accentLight: '#c8956e',
    glow: 'rgba(138, 87, 42, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(138, 87, 42, 0.09) 0%, rgba(74, 43, 18, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(217, 168, 108, 0.14) 0%, rgba(37, 23, 15, 0.8) 100%)',
    iconColorLight: '#8a572a',
    iconColorDark: '#f0cb9e',
    badgeBg: 'rgba(138, 87, 42, 0.15)',
    badgeText: '#6e411b',
  },
  gold: {
    id: 'gold',
    name: 'توليفة ذهبية ومخبوزات',
    accent: '#d97706',
    accentLight: '#fbbf24',
    glow: 'rgba(217, 119, 6, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(251, 191, 36, 0.15) 0%, rgba(45, 29, 10, 0.8) 100%)',
    iconColorLight: '#b45309',
    iconColorDark: '#fde68a',
    badgeBg: 'rgba(217, 119, 6, 0.15)',
    badgeText: '#92400e',
  },
  mocha: {
    id: 'mocha',
    name: 'موكا وشوكولاتة',
    accent: '#78350f',
    accentLight: '#b45309',
    glow: 'rgba(120, 53, 15, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(120, 53, 15, 0.1) 0%, rgba(180, 83, 9, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(180, 83, 9, 0.16) 0%, rgba(40, 20, 10, 0.8) 100%)',
    iconColorLight: '#78350f',
    iconColorDark: '#fcd34d',
    badgeBg: 'rgba(120, 53, 15, 0.15)',
    badgeText: '#78350f',
  },
  ice: {
    id: 'ice',
    name: 'مشروبات مثلجة وصودا',
    accent: '#0284c7',
    accentLight: '#38bdf8',
    glow: 'rgba(2, 132, 199, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(14, 165, 233, 0.12) 0%, rgba(56, 189, 248, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(56, 189, 248, 0.15) 0%, rgba(12, 35, 55, 0.8) 100%)',
    iconColorLight: '#0284c7',
    iconColorDark: '#7dd3fc',
    badgeBg: 'rgba(2, 132, 199, 0.15)',
    badgeText: '#0369a1',
  },
  berry: {
    id: 'berry',
    name: 'حلويات وتوتيات',
    accent: '#e11d48',
    accentLight: '#fb7185',
    glow: 'rgba(225, 29, 72, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(225, 29, 72, 0.1) 0%, rgba(244, 63, 94, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(251, 113, 133, 0.15) 0%, rgba(50, 15, 25, 0.8) 100%)',
    iconColorLight: '#e11d48',
    iconColorDark: '#fda4af',
    badgeBg: 'rgba(225, 29, 72, 0.15)',
    badgeText: '#be123c',
  },
  emerald: {
    id: 'emerald',
    name: 'شاي وأعشاب طبيعية',
    accent: '#059669',
    accentLight: '#34d399',
    glow: 'rgba(5, 150, 105, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(5, 150, 105, 0.1) 0%, rgba(16, 185, 129, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(52, 211, 153, 0.15) 0%, rgba(10, 40, 25, 0.8) 100%)',
    iconColorLight: '#059669',
    iconColorDark: '#6ee7b7',
    badgeBg: 'rgba(5, 150, 105, 0.15)',
    badgeText: '#047857',
  },
  amber: {
    id: 'amber',
    name: 'عصائر منعشة وحمضيات',
    accent: '#ea580c',
    accentLight: '#fb923c',
    glow: 'rgba(234, 88, 12, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(234, 88, 12, 0.1) 0%, rgba(249, 115, 22, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(251, 146, 60, 0.15) 0%, rgba(50, 20, 10, 0.8) 100%)',
    iconColorLight: '#ea580c',
    iconColorDark: '#fdba74',
    badgeBg: 'rgba(234, 88, 12, 0.15)',
    badgeText: '#c2410c',
  },
  cream: {
    id: 'cream',
    name: 'حليب وكريمة ناعمة',
    accent: '#d97706',
    accentLight: '#fef3c7',
    glow: 'rgba(217, 119, 6, 0.2)',
    bgLight: 'linear-gradient(145deg, rgba(254, 243, 199, 0.5) 0%, rgba(253, 230, 138, 0.1) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(254, 243, 199, 0.12) 0%, rgba(30, 20, 10, 0.8) 100%)',
    iconColorLight: '#b45309',
    iconColorDark: '#fef3c7',
    badgeBg: 'rgba(217, 119, 6, 0.15)',
    badgeText: '#92400e',
  },
  sunset: {
    id: 'sunset',
    name: 'غروب دافئ وبرتقالي',
    accent: '#f97316',
    accentLight: '#fdba74',
    glow: 'rgba(249, 115, 22, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(249, 115, 22, 0.1) 0%, rgba(234, 88, 12, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(253, 186, 116, 0.15) 0%, rgba(45, 18, 5, 0.8) 100%)',
    iconColorLight: '#ea580c',
    iconColorDark: '#fed7aa',
    badgeBg: 'rgba(249, 115, 22, 0.15)',
    badgeText: '#c2410c',
  },
  caramel: {
    id: 'caramel',
    name: 'كراميل وحلوى دافئة',
    accent: '#b45309',
    accentLight: '#fde68a',
    glow: 'rgba(180, 83, 9, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(180, 83, 9, 0.1) 0%, rgba(217, 119, 6, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(253, 230, 138, 0.15) 0%, rgba(35, 18, 5, 0.8) 100%)',
    iconColorLight: '#92400e',
    iconColorDark: '#fde68a',
    badgeBg: 'rgba(180, 83, 9, 0.15)',
    badgeText: '#78350f',
  },
};

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=600&auto=format&fit=crop&q=80';

// 🌟 خريطة المطابقة الدقيقة بالاسم لكل صنف في قائمة بن العجوز
export const EXACT_PRODUCT_IMAGES: Record<string, string> = {
  // ☕ القهوة المحضرة
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

export function getCategoryVisual(categoryName: string): CategoryVisual {
  const n = (categoryName || '').toLowerCase().trim();

  if (n.includes('مشروب') || n.includes('بارد') || n.includes('عصير') || n.includes('مثلج')) {
    return {
      icon: 'cupSoda',
      emoji: '🧊',
      theme: 'ice',
      cardClass: 'theme-ice',
      iconBgClass: 'bg-theme-ice',
      image: EXACT_PRODUCT_IMAGES['عصير مانجو'] || DEFAULT_IMAGE,
    };
  }
  if (n.includes('بن') || n.includes('حبوب') || n.includes('مطحون') || n.includes('توليف')) {
    return {
      icon: 'bean',
      emoji: '🫘',
      theme: 'espresso',
      cardClass: 'theme-espresso',
      iconBgClass: 'bg-theme-espresso',
      image: EXACT_PRODUCT_IMAGES['بن برازيلى ريو وسط'] || DEFAULT_IMAGE,
    };
  }
  if (n.includes('حلو') || n.includes('كيك') || n.includes('مخبوز') || n.includes('سناك')) {
    return {
      icon: 'cake',
      emoji: '🥐',
      theme: 'gold',
      cardClass: 'theme-gold',
      iconBgClass: 'bg-theme-gold',
      image: EXACT_PRODUCT_IMAGES['لارج مولتن'] || DEFAULT_IMAGE,
    };
  }
  if (n.includes('شاي') || n.includes('شاى') || n.includes('أعشاب') || n.includes('اعشاب')) {
    return {
      icon: 'sparkles',
      emoji: '🫖',
      theme: 'emerald',
      cardClass: 'theme-emerald',
      iconBgClass: 'bg-theme-emerald',
      image: EXACT_PRODUCT_IMAGES['شاى كرك'] || DEFAULT_IMAGE,
    };
  }
  if (n.includes('بهار') || n.includes('تحويج') || n.includes('مستلزم')) {
    return {
      icon: 'sparkles',
      emoji: '🌿',
      theme: 'amber',
      cardClass: 'theme-amber',
      iconBgClass: 'bg-theme-amber',
      image: EXACT_PRODUCT_IMAGES['حبهان'] || DEFAULT_IMAGE,
    };
  }

  return {
    icon: 'coffee',
    emoji: '☕',
    theme: 'espresso',
    cardClass: 'theme-espresso',
    iconBgClass: 'bg-theme-espresso',
    image: EXACT_PRODUCT_IMAGES['قهوة تركى سنجل'] || DEFAULT_IMAGE,
  };
}

export function getProductVisual(product: any): ProductVisual {
  const rawName = String(product?.name_ar || product?.name || '');
  const trimmedName = rawName.trim();
  const name = trimmedName.toLowerCase();
  const category = String(product?.category_name || product?.category || '').toLowerCase();
  const sku = String(product?.sku || '').toLowerCase();
  const fullText = `${name} ${category} ${sku}`;

  let icon = 'coffee';
  let colorTheme = 'espresso';
  let badge: string | undefined = undefined;
  let categoryEmoji = '☕';

  // Weight badge detection if present
  if (fullText.includes('250') || fullText.includes('ربع')) {
    badge = '¼ كجم';
  } else if (fullText.includes('500') || fullText.includes('نصف') || fullText.includes('نص')) {
    badge = '½ كجم';
  } else if (
    fullText.includes('1000') ||
    fullText.includes('1 كيلو') ||
    fullText.includes('كيلو')
  ) {
    badge = '1 كجم';
  }

  // 1. Bakery, Croissant & Sweets
  if (fullText.includes('كرواسون')) {
    icon = 'croissant';
    colorTheme = 'gold';
    categoryEmoji = '🥐';
    if (!badge) badge = 'مخبوزات طازجة';
  } else if (fullText.includes('كيك') || fullText.includes('مولتن')) {
    icon = 'cake';
    colorTheme = 'mocha';
    categoryEmoji = '🍰';
    if (!badge) badge = 'لافا ساخنة';
  } else if (
    fullText.includes('معمول') ||
    fullText.includes('بلح') ||
    fullText.includes('تمر') ||
    fullText.includes('ماندولين') ||
    fullText.includes('اوريو') ||
    fullText.includes('أوريو') ||
    fullText.includes('ويفر')
  ) {
    icon = 'cookie';
    colorTheme =
      fullText.includes('اوريو') || fullText.includes('أوريو') || fullText.includes('ماندولين')
        ? 'mocha'
        : 'gold';
    categoryEmoji = '🍪';
    if (!badge) badge = 'سناكس فاخر';
  }
  // 2. Cold drinks, Ice coffee, Water, Sodas
  else if (fullText.includes('آيس') || fullText.includes('ايس') || fullText.includes('مثلج')) {
    icon = 'cupSoda';
    colorTheme = 'ice';
    badge = 'مثلج 🧊';
    categoryEmoji = '🧊';
  } else if (fullText.includes('مياه') || fullText.includes('ميه')) {
    icon = 'glassWater';
    colorTheme = 'ice';
    categoryEmoji = '💧';
    if (!badge) badge = 'نقية';
  } else if (
    fullText.includes('بيبسي') ||
    fullText.includes('كولا') ||
    fullText.includes('صودا') ||
    fullText.includes('ماكس') ||
    fullText.includes('كانز')
  ) {
    icon = 'cupSoda';
    colorTheme = 'ice';
    categoryEmoji = '🥤';
    if (!badge) badge = 'بارد مثلج';
  } else if (fullText.includes('ريد بول') || fullText.includes('طاقة')) {
    icon = 'zap';
    colorTheme = 'ice';
    categoryEmoji = '⚡';
    if (!badge) badge = 'طاقة وحيوية';
  }
  // 3. Juices & Fruits
  else if (fullText.includes('تفاح')) {
    icon = 'apple';
    colorTheme = 'amber';
    categoryEmoji = '🍎';
    if (!badge) badge = 'طبيعي';
  } else if (fullText.includes('برتقال') || fullText.includes('عصير')) {
    icon = 'citrus';
    colorTheme = fullText.includes('فراول')
      ? 'berry'
      : fullText.includes('جواف')
        ? 'emerald'
        : 'amber';
    categoryEmoji = '🧃';
    if (!badge) badge = 'فريش طبيعي';
  }
  // 4. Hot Chocolate & Mocha
  else if (
    fullText.includes('هوت شوكلت') ||
    fullText.includes('هوت شوكليت') ||
    fullText.includes('مارشملو') ||
    fullText.includes('شوكولات') ||
    fullText.includes('كاكاو')
  ) {
    icon = 'cupSoda';
    colorTheme = 'mocha';
    categoryEmoji = '🍫';
    if (!badge) badge = 'شوكولاتة دافئة';
  }
  // 5. Tea & Herbs
  else if (fullText.includes('كرك') || fullText.includes('عدن')) {
    icon = 'flame';
    colorTheme = 'amber';
    categoryEmoji = '🫖';
    if (!badge) badge = 'شاي كرك متبل';
  } else if (fullText.includes('شاى') || fullText.includes('شاي')) {
    icon = 'coffee';
    colorTheme = 'emerald';
    categoryEmoji = '🫖';
    if (!badge) badge = 'شاي أصيل';
  } else if (
    fullText.includes('يانسون') ||
    fullText.includes('نعناع') ||
    fullText.includes('اعشاب') ||
    fullText.includes('أعشاب')
  ) {
    icon = 'sparkles';
    colorTheme = 'emerald';
    categoryEmoji = '🌿';
    if (!badge) badge = 'أعشاب مهدئة';
  }
  // 6. Spices / Ingredients
  else if (
    fullText.includes('حبهان') ||
    fullText.includes('هيل') ||
    fullText.includes('تحويج') ||
    fullText.includes('بهار')
  ) {
    icon = 'sparkles';
    colorTheme = 'emerald';
    categoryEmoji = '🌿';
    if (!badge) badge = 'بهارات وتحويج';
  }
  // 7. Beans & Packaged Blends
  else if (
    category.includes('بن') ||
    name.startsWith('بن ') ||
    fullText.includes('حبوب') ||
    fullText.includes('توليف') ||
    fullText.includes('ارابيكا') ||
    fullText.includes('روبيستا') ||
    fullText.includes('هندى') ||
    fullText.includes('يمنى') ||
    fullText.includes('كولومب') ||
    fullText.includes('برازيل') ||
    fullText.includes('حبش') ||
    fullText.includes('فيتنام') ||
    fullText.includes('اندونيس')
  ) {
    icon = 'bean';
    colorTheme =
      fullText.includes('توليف') ||
      fullText.includes('اسبيشيال') ||
      fullText.includes('شرقى') ||
      fullText.includes('بندق')
        ? 'gold'
        : 'espresso';
    categoryEmoji = '🫘';
    if (!badge) badge = 'حبوب ممتازة';
  }
  // 8. Prepared Coffee drinks
  else if (fullText.includes('ميكاتو') || fullText.includes('ماكياتو')) {
    icon = 'coffee';
    colorTheme = 'mocha';
    categoryEmoji = '☕';
    if (!badge) badge = 'ماكياتو';
  } else if (
    fullText.includes('دبل') &&
    (fullText.includes('سبريسو') || fullText.includes('اسبرسو') || fullText.includes('إسبريسو'))
  ) {
    icon = 'flame';
    colorTheme = 'espresso';
    categoryEmoji = '☕';
    if (!badge) badge = 'دبل شوت';
  } else if (
    fullText.includes('سبريسو') ||
    fullText.includes('اسبرسو') ||
    fullText.includes('إسبريسو') ||
    fullText.includes('أسبريسو')
  ) {
    icon = 'zap';
    colorTheme = 'espresso';
    categoryEmoji = '☕';
    if (!badge) badge = 'إسبريسو نقي';
  } else if (fullText.includes('كابتشينو')) {
    icon = 'coffee';
    colorTheme = 'mocha';
    categoryEmoji = '☕';
    if (!badge) badge = 'كريمي';
  } else if (fullText.includes('لاتيه')) {
    icon = 'coffee';
    colorTheme = 'gold';
    categoryEmoji = '☕';
    if (!badge) badge = 'حليب ناعم';
  } else if (fullText.includes('امريكان') || fullText.includes('أمريكان')) {
    icon = 'coffee';
    colorTheme = 'espresso';
    categoryEmoji = '☕';
    if (!badge) badge = 'أمريكانو';
  } else if (fullText.includes('نسكافيه')) {
    icon = 'coffee';
    colorTheme = 'gold';
    categoryEmoji = '☕';
    if (!badge) badge = 'سريع التحضير';
  } else if (fullText.includes('تركي') || fullText.includes('تركى')) {
    icon = 'coffee';
    colorTheme = 'espresso';
    categoryEmoji = '☕';
    if (!badge) badge = 'قهوة تركية';
  } else if (fullText.includes('فرنساو') || fullText.includes('فرنساوي')) {
    icon = 'coffee';
    colorTheme = 'espresso';
    categoryEmoji = '☕';
    if (!badge) badge = 'بالحليب';
  }

  // 🌟 Priority for image selection:
  // 1. Explicit DB image URL
  // 2. Exact match in catalog
  // 3. Fallback 3D icon based on product type
  let threeDImage: string = DEFAULT_IMAGE;

  if (typeof product?.image_url === 'string' && product.image_url.startsWith('http')) {
    threeDImage = product.image_url;
  } else if (typeof product?.image === 'string' && product.image.startsWith('http')) {
    threeDImage = product.image;
  } else if (EXACT_PRODUCT_IMAGES[trimmedName]) {
    threeDImage = EXACT_PRODUCT_IMAGES[trimmedName];
  } else if (EXACT_PRODUCT_IMAGES[rawName]) {
    threeDImage = EXACT_PRODUCT_IMAGES[rawName];
  } else {
    // 3D icon fallbacks
    if (
      fullText.includes('كرواسون') ||
      fullText.includes('مخبوز') ||
      fullText.includes('كيك') ||
      fullText.includes('سناك') ||
      fullText.includes('معمول')
    ) {
      threeDImage = '/3d-icons/bakery-croissant.jpg';
    } else if (
      fullText.includes('حبوب') ||
      fullText.includes('بن') ||
      fullText.includes('توليف') ||
      fullText.includes('ارابيكا') ||
      fullText.includes('روبيستا')
    ) {
      threeDImage = '/3d-icons/beans.jpg';
    } else if (
      fullText.includes('آيس') ||
      fullText.includes('ايس') ||
      fullText.includes('مثلج') ||
      fullText.includes('مشروبات باردة') ||
      fullText.includes('بارد') ||
      fullText.includes('صودا') ||
      fullText.includes('بيبسي') ||
      fullText.includes('عصير')
    ) {
      threeDImage = '/3d-icons/iced-drink.jpg';
    } else if (
      fullText.includes('إسبريسو') ||
      fullText.includes('اسبريسو') ||
      fullText.includes('أسبريسو') ||
      fullText.includes('قهوة') ||
      fullText.includes('كوفي') ||
      fullText.includes('كابتشينو') ||
      fullText.includes('لاتيه') ||
      fullText.includes('شاي')
    ) {
      threeDImage = '/3d-icons/coffee-hot.jpg';
    }
  }

  const themeDef = (PRODUCT_THEMES[colorTheme] || PRODUCT_THEMES.espresso)!;

  return {
    icon,
    colorTheme,
    badge,
    categoryEmoji,
    cardClass: `theme-${colorTheme}`,
    iconBgClass: `bg-theme-${colorTheme}`,
    badgeClass: `badge-theme-${colorTheme}`,
    glowColor: themeDef.glow,
    accentColor: themeDef.accent,
    threeDImage,
  };
}

export function useProductVisuals() {
  return {
    getProductVisual,
    getCategoryVisual,
    PRODUCT_THEMES,
  };
}

export default useProductVisuals;
