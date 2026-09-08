/**
 * useProductVisuals — محرك التصميم والأيقونات الذكي لشاشات الكاشير ونقاط البيع
 * يقوم بتحليل اسم الصنف وتصنيفه وتوليد أيقونة معبرة، تدرج لوني فاخر، وشارة توضيحية.
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
    name: 'شاي وأعشاب وماتشا',
    accent: '#059669',
    accentLight: '#34d399',
    glow: 'rgba(5, 150, 105, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(16, 185, 129, 0.11) 0%, rgba(5, 150, 105, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(52, 211, 153, 0.15) 0%, rgba(10, 40, 25, 0.8) 100%)',
    iconColorLight: '#059669',
    iconColorDark: '#6ee7b7',
    badgeBg: 'rgba(5, 150, 105, 0.15)',
    badgeText: '#047857',
  },
  amber: {
    id: 'amber',
    name: 'عصائر وحمضيات',
    accent: '#ea580c',
    accentLight: '#fb923c',
    glow: 'rgba(234, 88, 12, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(234, 88, 12, 0.11) 0%, rgba(249, 115, 22, 0.03) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(251, 146, 60, 0.15) 0%, rgba(48, 22, 10, 0.8) 100%)',
    iconColorLight: '#ea580c',
    iconColorDark: '#fdba74',
    badgeBg: 'rgba(234, 88, 12, 0.15)',
    badgeText: '#c2410c',
  },
  cream: {
    id: 'cream',
    name: 'حليب وكريمة ولاتيه',
    accent: '#a16207',
    accentLight: '#eab308',
    glow: 'rgba(161, 98, 7, 0.2)',
    bgLight:
      'linear-gradient(145deg, rgba(200, 149, 110, 0.14) 0%, rgba(254, 243, 199, 0.25) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(234, 179, 8, 0.12) 0%, rgba(35, 27, 18, 0.8) 100%)',
    iconColorLight: '#92400e',
    iconColorDark: '#fef08a',
    badgeBg: 'rgba(161, 98, 7, 0.14)',
    badgeText: '#854d0e',
  },
  sunset: {
    id: 'sunset',
    name: 'سموذي وعصائر مميزة',
    accent: '#9333ea',
    accentLight: '#c084fc',
    glow: 'rgba(147, 51, 234, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(147, 51, 234, 0.1) 0%, rgba(236, 72, 153, 0.04) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(192, 132, 252, 0.15) 0%, rgba(38, 15, 52, 0.8) 100%)',
    iconColorLight: '#9333ea',
    iconColorDark: '#d8b4fe',
    badgeBg: 'rgba(147, 51, 234, 0.15)',
    badgeText: '#7e22ce',
  },
  caramel: {
    id: 'caramel',
    name: 'كراميل وسيرب',
    accent: '#b45309',
    accentLight: '#f59e0b',
    glow: 'rgba(180, 83, 9, 0.25)',
    bgLight: 'linear-gradient(145deg, rgba(180, 83, 9, 0.12) 0%, rgba(245, 158, 11, 0.04) 100%)',
    bgDark: 'linear-gradient(145deg, rgba(245, 158, 11, 0.15) 0%, rgba(42, 25, 12, 0.8) 100%)',
    iconColorLight: '#b45309',
    iconColorDark: '#fcd34d',
    badgeBg: 'rgba(180, 83, 9, 0.15)',
    badgeText: '#92400e',
  },
};

/**
 * فحص وتحليل الصنف وإرجاع الأيقونة واللون والشارة المناسبة
 */
export function getProductVisual(product: any): ProductVisual {
  if (!product) {
    return {
      icon: 'coffee',
      colorTheme: 'espresso',
      categoryEmoji: '☕',
      cardClass: 'visual-espresso',
      iconBgClass: 'icon-bg-espresso',
      badgeClass: 'badge-espresso',
      glowColor: PRODUCT_THEMES.espresso!.glow,
      accentColor: PRODUCT_THEMES.espresso!.accent,
      threeDImage: '',
    };
  }

  const name = String(product.name_ar || product.name || product.name_en || '').toLowerCase();
  const cat = String(product.category_name || product.category || '').toLowerCase();
  const fullText = `${name} ${cat}`;

  let icon = 'coffee';
  let colorTheme = 'espresso';
  let badge: string | undefined = undefined;
  let categoryEmoji = '☕';

  // 1. حبوب البن والتوليفات والبن الخام
  if (
    fullText.includes('بن') ||
    fullText.includes('حبوب') ||
    fullText.includes('توليف') ||
    fullText.includes('تحويج') ||
    fullText.includes('طحن') ||
    fullText.includes('إثيوبي') ||
    fullText.includes('برازيلي') ||
    fullText.includes('كولومبي') ||
    fullText.includes('يمني') ||
    fullText.includes('روبوستا') ||
    fullText.includes('أرابيكا')
  ) {
    icon = 'bean';
    colorTheme = 'espresso';
    categoryEmoji = '🫘';

    if (name.includes('كيلو') || name.includes('1ك') || name.includes('1000')) {
      badge = '1 كجم 🫘';
    } else if (name.includes('نصف') || name.includes('500')) {
      badge = '½ كجم';
    } else if (name.includes('ربع') || name.includes('250')) {
      badge = '¼ كجم';
    } else if (name.includes('ثمن') || name.includes('125')) {
      badge = '⅛ كجم';
    } else if (name.includes('محوج') || name.includes('حبهان') || name.includes('ملكي')) {
      badge = 'توليفة محوجة ✨';
    } else if (name.includes('سادة')) {
      badge = 'بن سادة';
    } else if (name.includes('تركي')) {
      badge = 'بن تركي ☕';
    } else {
      badge = 'بن فاخر';
    }
  }

  // 2. المشروبات المثلجة والباردة والفرابيه والموهيتو
  else if (
    fullText.includes('بارد') ||
    fullText.includes('مثلج') ||
    fullText.includes('ايس') ||
    fullText.includes('آيس') ||
    fullText.includes('ice') ||
    fullText.includes('iced') ||
    fullText.includes('فرابيه') ||
    fullText.includes('frappe') ||
    fullText.includes('موهيتو') ||
    fullText.includes('mojito') ||
    fullText.includes('سموذي') ||
    fullText.includes('smoothie') ||
    fullText.includes('بوبا') ||
    fullText.includes('ميلك شيك')
  ) {
    if (
      fullText.includes('ميلك شيك') ||
      fullText.includes('شيك') ||
      fullText.includes('آيس كريم')
    ) {
      icon = 'iceCream';
    } else if (fullText.includes('موهيتو') || fullText.includes('ليمون نعناع')) {
      icon = 'citrus';
    } else {
      icon = 'cupSoda';
    }
    colorTheme = 'ice';
    categoryEmoji = '🧊';
    badge = 'مثلج 🧊';
  }

  // 3. المياه المعدنية والمشروبات الغازية
  else if (
    fullText.includes('مياه') ||
    fullText.includes('ماء') ||
    fullText.includes('معدنية') ||
    fullText.includes('صودا') ||
    fullText.includes('غازية') ||
    fullText.includes('بيبسي') ||
    (fullText.includes('كولا') && !fullText.includes('شوكولات')) ||
    fullText.includes('سفن') ||
    fullText.includes('شويبس') ||
    fullText.includes('ريد بول') ||
    fullText.includes('طاقة')
  ) {
    if (fullText.includes('مياه') || fullText.includes('ماء')) {
      icon = 'glassWater';
      colorTheme = 'ice';
      categoryEmoji = '💧';
      badge = 'مياه معدنية';
    } else if (fullText.includes('طاقة') || fullText.includes('ريد بول')) {
      icon = 'zap';
      colorTheme = 'gold';
      categoryEmoji = '⚡';
      badge = 'طاقة ⚡';
    } else {
      icon = 'cupSoda';
      colorTheme = 'ice';
      categoryEmoji = '🥤';
      badge = 'مشروب غازي';
    }
  }

  // 4. العصائر والفواكه الطبيعية
  else if (
    fullText.includes('عصير') ||
    fullText.includes('برتقال') ||
    fullText.includes('ليمون') ||
    fullText.includes('مانجو') ||
    fullText.includes('فراولة') ||
    fullText.includes('جوافة') ||
    fullText.includes('أناناس') ||
    fullText.includes('رمان') ||
    fullText.includes('كوكتيل') ||
    fullText.includes('تفاح') ||
    fullText.includes('موز') ||
    fullText.includes('كرز') ||
    fullText.includes('عنب') ||
    fullText.includes('حمضيات')
  ) {
    if (fullText.includes('برتقال') || fullText.includes('ليمون') || fullText.includes('حمضيات')) {
      icon = 'citrus';
      colorTheme = 'amber';
      badge = 'حمضيات طازجة 🍊';
    } else if (fullText.includes('تفاح')) {
      icon = 'apple';
      colorTheme = 'emerald';
      badge = 'تفاح طبيعي 🍏';
    } else if (
      fullText.includes('كرز') ||
      fullText.includes('فراولة') ||
      fullText.includes('رمان')
    ) {
      icon = 'cherry';
      colorTheme = 'berry';
      badge = 'فراولة وتوت 🍓';
    } else if (fullText.includes('عنب')) {
      icon = 'grape';
      colorTheme = 'sunset';
      badge = 'عنب طبيعي 🍇';
    } else if (fullText.includes('موز')) {
      icon = 'banana';
      colorTheme = 'gold';
      badge = 'موز طازج 🍌';
    } else {
      icon = 'citrus';
      colorTheme = 'amber';
      badge = 'طازج فريش 🍹';
    }
    categoryEmoji = '🍹';
  }

  // 5. المشروبات الساخنة والإسبريسو واللاتيه والموكا
  else if (
    fullText.includes('اسبريسو') ||
    fullText.includes('espresso') ||
    fullText.includes('كابتشينو') ||
    fullText.includes('cappuccino') ||
    fullText.includes('لاتيه') ||
    fullText.includes('latte') ||
    fullText.includes('موكا') ||
    fullText.includes('mocha') ||
    fullText.includes('أمريكانو') ||
    fullText.includes('كورتادو') ||
    fullText.includes('فلات وايت') ||
    fullText.includes('هوت شوكليت') ||
    fullText.includes('سحلب') ||
    fullText.includes('كاكاو') ||
    fullText.includes('قرفة') ||
    fullText.includes('قهوة')
  ) {
    if (fullText.includes('هوت شوكليت') || fullText.includes('كاكاو')) {
      icon = 'coffee';
      colorTheme = 'mocha';
      badge = 'هوت شوكليت 🍫';
    } else if (fullText.includes('سحلب') || fullText.includes('قرفة')) {
      icon = 'flame';
      colorTheme = 'cream';
      badge = 'ساخن ودافئ 🔥';
    } else if (fullText.includes('لاتيه') || fullText.includes('كابتشينو')) {
      icon = 'coffee';
      colorTheme = 'cream';
      badge = 'رغوة حليب ☕';
    } else {
      icon = 'coffee';
      colorTheme = 'espresso';
      badge = 'قهوة ساخنة ☕';
    }
    categoryEmoji = '☕';
  }

  // 6. الشاي والأعشاب والماتشا
  else if (
    fullText.includes('شاي') ||
    fullText.includes('أعشاب') ||
    fullText.includes('كركديه') ||
    fullText.includes('نعناع') ||
    fullText.includes('يانسون') ||
    fullText.includes('بابونج') ||
    fullText.includes('زنجبيل') ||
    fullText.includes('كرك') ||
    fullText.includes('ماتشا') ||
    fullText.includes('أخضر')
  ) {
    icon = 'wheat';
    colorTheme = 'emerald';
    categoryEmoji = '🍵';
    if (fullText.includes('ماتشا')) {
      badge = 'ماتشا ياباني 🍵';
    } else if (fullText.includes('كرك')) {
      badge = 'شاي كرك متبل ☕';
    } else if (fullText.includes('كركديه')) {
      badge = 'كركديه بلدي 🌺';
      colorTheme = 'berry';
    } else {
      badge = 'أعشاب طبيعية 🌿';
    }
  }

  // 7. الكيك والحلويات والوافل والتشيز كيك والكوكيز
  else if (
    fullText.includes('حلوي') ||
    fullText.includes('كيك') ||
    fullText.includes('cake') ||
    fullText.includes('تشيز كيك') ||
    fullText.includes('براونيز') ||
    fullText.includes('مولتن') ||
    fullText.includes('كوكيز') ||
    fullText.includes('cookie') ||
    fullText.includes('وافل') ||
    fullText.includes('waffle') ||
    fullText.includes('بان كيك') ||
    fullText.includes('دونات') ||
    fullText.includes('donut') ||
    fullText.includes('شوكولات') ||
    fullText.includes('نوتيلا') ||
    fullText.includes('لوتس') ||
    fullText.includes('بسكويت')
  ) {
    if (fullText.includes('كوكيز') || fullText.includes('بسكويت')) {
      icon = 'cookie';
      colorTheme = 'gold';
      badge = 'كوكيز مقرمش 🍪';
    } else if (fullText.includes('دونات')) {
      icon = 'donut';
      colorTheme = 'berry';
      badge = 'دونات طازج 🍩';
    } else if (
      fullText.includes('شوكولات') ||
      fullText.includes('براونيز') ||
      fullText.includes('مولتن')
    ) {
      icon = 'cakeSlice';
      colorTheme = 'mocha';
      badge = 'شوكولاتة فاخرة 🍫';
    } else {
      icon = 'cake';
      colorTheme = 'berry';
      badge = 'حلوى طازجة 🍰';
    }
    categoryEmoji = '🍰';
  }

  // 8. المخبوزات والكرواسون والفطائر
  else if (
    fullText.includes('مخبوز') ||
    fullText.includes('كرواسون') ||
    fullText.includes('croissant') ||
    fullText.includes('باتيه') ||
    fullText.includes('فطير') ||
    fullText.includes('دنش') ||
    fullText.includes('توست') ||
    fullText.includes('خبز')
  ) {
    icon = 'croissant';
    colorTheme = 'gold';
    categoryEmoji = '🥐';
    badge = 'مخبوز طازج 🥐';
  }

  // 9. الساندوتشات والوجبات والمأكولات والبيتزا
  else if (
    fullText.includes('ساندوتش') ||
    fullText.includes('sandwich') ||
    fullText.includes('وجب') ||
    fullText.includes('شاورما') ||
    fullText.includes('برجر') ||
    fullText.includes('جبن') ||
    fullText.includes('بيتزا') ||
    fullText.includes('pizza') ||
    fullText.includes('اكل') ||
    fullText.includes('شورب') ||
    fullText.includes('سلط')
  ) {
    if (fullText.includes('بيتزا')) {
      icon = 'pizza';
      colorTheme = 'amber';
      badge = 'بيتزا ساخنة 🍕';
    } else if (fullText.includes('سلط')) {
      icon = 'salad';
      colorTheme = 'emerald';
      badge = 'سلطة طازجة 🥗';
    } else if (fullText.includes('شورب')) {
      icon = 'soup';
      colorTheme = 'amber';
      badge = 'شوربة ساخنة 🥣';
    } else {
      icon = 'sandwich';
      colorTheme = 'gold';
      badge = 'ساندوتش طازج 🥪';
    }
    categoryEmoji = '🥪';
  }

  // 10. المكسرات والتسالي والفشار
  else if (
    fullText.includes('مكسرات') ||
    fullText.includes('كاجو') ||
    fullText.includes('لوز') ||
    fullText.includes('فستق') ||
    fullText.includes('بندق') ||
    fullText.includes('لب') ||
    fullText.includes('تسالي') ||
    fullText.includes('فشار') ||
    fullText.includes('popcorn') ||
    fullText.includes('مقرمش') ||
    fullText.includes('سناكس')
  ) {
    if (fullText.includes('فشار')) {
      icon = 'popcorn';
      colorTheme = 'gold';
      badge = 'فشار مقرمش 🍿';
    } else {
      icon = 'nut';
      colorTheme = 'amber';
      badge = 'مكسرات فاخرة 🥜';
    }
    categoryEmoji = '🥜';
  }

  // 11. الإضافات والحليب والنكهات
  else if (
    fullText.includes('حليب') ||
    fullText.includes('لبن') ||
    fullText.includes('كريمة') ||
    fullText.includes('مكثف') ||
    fullText.includes('سكر') ||
    fullText.includes('عسل') ||
    fullText.includes('سيرب') ||
    fullText.includes('نكهة') ||
    fullText.includes('فانيليا') ||
    fullText.includes('كراميل') ||
    fullText.includes('صوص') ||
    fullText.includes('مستكة') ||
    fullText.includes('إضاف')
  ) {
    if (fullText.includes('حليب') || fullText.includes('لبن') || fullText.includes('كريمة')) {
      icon = 'milk';
      colorTheme = 'cream';
      badge = 'حليب طبيعي 🥛';
    } else if (
      fullText.includes('كراميل') ||
      fullText.includes('سيرب') ||
      fullText.includes('صوص')
    ) {
      icon = 'sparkles';
      colorTheme = 'caramel';
      badge = 'سيرب وإضافات ✨';
    } else {
      icon = 'sparkles';
      colorTheme = 'gold';
      badge = 'إضافة مميزة ✨';
    }
    categoryEmoji = '🍯';
  }

  // 12. تعيين الصورة ثلاثية الأبعاد الفاخرة (3D Rendered Illustration)
  let threeDImage = '/3d-icons/coffee-hot.jpg';

  if (product?.image || product?.image_url) {
    threeDImage = product.image || product.image_url;
  } else if (
    fullText.includes('ملكي') ||
    fullText.includes('توليفة خاصة') ||
    fullText.includes('توليفة العجوز') ||
    fullText.includes('فاخر') ||
    fullText.includes('سبيشال') ||
    fullText.includes('توليفة')
  ) {
    threeDImage = '/3d-icons/special-blend.jpg';
  } else if (
    fullText.includes('حبوب') ||
    fullText.includes('بن أخضر') ||
    fullText.includes('مطحون') ||
    fullText.includes('كجم') ||
    fullText.includes('كيلو') ||
    fullText.includes('ربع') ||
    fullText.includes('نصف') ||
    fullText.includes('طحن') ||
    icon === 'bean' ||
    categoryEmoji === '🫘'
  ) {
    threeDImage = '/3d-icons/beans.jpg';
  } else if (
    colorTheme === 'ice' ||
    icon === 'cupSoda' ||
    fullText.includes('ايس') ||
    fullText.includes('مثلج') ||
    fullText.includes('بارد') ||
    fullText.includes('فرابيه') ||
    fullText.includes('لاتيه بارد')
  ) {
    threeDImage = '/3d-icons/iced-drink.jpg';
  } else if (
    colorTheme === 'amber' ||
    colorTheme === 'sunset' ||
    icon === 'citrus' ||
    fullText.includes('عصير') ||
    fullText.includes('سموذي') ||
    fullText.includes('موهيتو') ||
    fullText.includes('ليمون') ||
    fullText.includes('برتقال') ||
    fullText.includes('مانجو') ||
    fullText.includes('فراولة')
  ) {
    threeDImage = '/3d-icons/mojito-juice.jpg';
  } else if (
    icon === 'croissant' ||
    icon === 'sandwich' ||
    fullText.includes('كرواسون') ||
    fullText.includes('croissant') ||
    fullText.includes('مخبوز') ||
    fullText.includes('باتيه') ||
    fullText.includes('ساندوتش') ||
    fullText.includes('توست')
  ) {
    threeDImage = '/3d-icons/bakery-croissant.jpg';
  } else if (
    colorTheme === 'berry' ||
    icon === 'cake' ||
    icon === 'cookie' ||
    icon === 'iceCream' ||
    fullText.includes('كيك') ||
    fullText.includes('شوكولات') ||
    fullText.includes('تورت') ||
    fullText.includes('حلوي') ||
    fullText.includes('وافل') ||
    fullText.includes('كوكيز') ||
    fullText.includes('براونيز')
  ) {
    threeDImage = '/3d-icons/dessert-cake.jpg';
  } else if (
    colorTheme === 'emerald' ||
    fullText.includes('شاي') ||
    fullText.includes('أعشاب') ||
    fullText.includes('نعناع') ||
    fullText.includes('يانسون') ||
    fullText.includes('كركديه') ||
    fullText.includes('ماتشا')
  ) {
    threeDImage = '/3d-icons/herbal-tea.jpg';
  } else {
    threeDImage = '/3d-icons/coffee-hot.jpg';
  }

  // null-safety: فهرسة Record بمفتاح متغير تعطي T|undefined — espresso موجودة دائماً كافتراضي
  const themeDef = (PRODUCT_THEMES[colorTheme] || PRODUCT_THEMES.espresso)!;

  return {
    icon,
    colorTheme,
    badge,
    categoryEmoji,
    cardClass: `theme-${colorTheme}`,
    iconBgClass: `icon-bg-${colorTheme}`,
    badgeClass: `badge-${colorTheme}`,
    glowColor: themeDef.glow,
    accentColor: themeDef.accent,
    threeDImage,
  };
}

/**
 * دالة مساعدة لتحديد أيقونة وإيموجي التصنيف
 */
export function getCategoryVisual(catName?: string) {
  if (!catName) {
    return {
      icon: 'coffee',
      emoji: '☕',
      theme: 'espresso',
    };
  }

  const n = catName.toLowerCase();

  if (
    n.includes('بن') ||
    n.includes('حبوب') ||
    n.includes('طحن') ||
    n.includes('توليف') ||
    n.includes('تركي')
  ) {
    return { icon: 'bean', emoji: '🫘', theme: 'espresso' };
  }

  if (n.includes('بارد') || n.includes('مثلج') || n.includes('ايس') || n.includes('فرابيه')) {
    return { icon: 'cupSoda', emoji: '🧊', theme: 'ice' };
  }

  if (n.includes('عصير') || n.includes('سموذي') || n.includes('فواكه')) {
    return { icon: 'citrus', emoji: '🍹', theme: 'amber' };
  }

  if (n.includes('حلوي') || n.includes('كيك') || n.includes('شوكولات') || n.includes('وافل')) {
    return { icon: 'cake', emoji: '🍰', theme: 'berry' };
  }

  if (n.includes('مخبوز') || n.includes('كرواسون') || n.includes('باتيه')) {
    return { icon: 'croissant', emoji: '🥐', theme: 'gold' };
  }

  if (n.includes('شاي') || n.includes('أعشاب') || n.includes('كركديه') || n.includes('ماتشا')) {
    return { icon: 'wheat', emoji: '🍵', theme: 'emerald' };
  }

  if (n.includes('ساندوتش') || n.includes('وجب') || n.includes('اكل') || n.includes('بيتزا')) {
    return { icon: 'sandwich', emoji: '🥪', theme: 'gold' };
  }

  if (n.includes('مياه') || n.includes('ماء') || n.includes('صودا')) {
    return { icon: 'glassWater', emoji: '💧', theme: 'ice' };
  }

  if (n.includes('مكسرات') || n.includes('تسالي') || n.includes('سناكس')) {
    return { icon: 'nut', emoji: '🥜', theme: 'amber' };
  }

  if (n.includes('إضاف') || n.includes('سيرب') || n.includes('صوص') || n.includes('نكه')) {
    return { icon: 'sparkles', emoji: '🍯', theme: 'caramel' };
  }

  return { icon: 'coffee', emoji: '☕', theme: 'espresso' };
}

export function useProductVisuals() {
  return {
    getProductVisual,
    getCategoryVisual,
    PRODUCT_THEMES,
  };
}
