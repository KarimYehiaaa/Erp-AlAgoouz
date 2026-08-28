import { describe, it, expect } from 'vitest';
import { getProductVisual, getCategoryVisual, PRODUCT_THEMES } from '../useProductVisuals';

describe('useProductVisuals composable', () => {
  it('identifies Turkish coffee beans and returns bean icon with espresso theme', () => {
    const visual = getProductVisual({
      name_ar: 'بن تركي سادة - 250 جرام',
      category_name: 'بن تركي',
    });
    expect(visual.icon).toBe('bean');
    expect(visual.colorTheme).toBe('espresso');
    expect(visual.badge).toContain('¼ كجم');
    expect(visual.categoryEmoji).toBe('🫘');
  });

  it('identifies cold drinks and iced coffees with ice theme and cupSoda icon', () => {
    const visual = getProductVisual({ name_ar: 'آيس كوفي كراميل', category_name: 'مشروبات باردة' });
    expect(visual.icon).toBe('cupSoda');
    expect(visual.colorTheme).toBe('ice');
    expect(visual.badge).toBe('مثلج 🧊');
  });

  it('identifies mineral water and soft drinks', () => {
    const visualWater = getProductVisual({
      name_ar: 'مياه معدنية صغيرة',
      category_name: 'مشروبات',
    });
    expect(visualWater.icon).toBe('glassWater');
    expect(visualWater.colorTheme).toBe('ice');

    const visualSoda = getProductVisual({ name_ar: 'بيبسي كانز', category_name: 'مشروبات غازية' });
    expect(visualSoda.icon).toBe('cupSoda');
  });

  it('identifies fresh juices with citrus/fruit icon and amber/fruit theme', () => {
    const visualJuice = getProductVisual({ name_ar: 'عصير برتقال فريش', category_name: 'عصائر' });
    expect(visualJuice.icon).toBe('citrus');
    expect(visualJuice.colorTheme).toBe('amber');

    const visualApple = getProductVisual({ name_ar: 'عصير تفاح طبيعي', category_name: 'عصائر' });
    expect(visualApple.icon).toBe('apple');
  });

  it('identifies hot chocolate and bakery items', () => {
    const visualHotChoc = getProductVisual({
      name_ar: 'هوت شوكليت بالمارشملو',
      category_name: 'مشروبات ساخنة',
    });
    expect(visualHotChoc.colorTheme).toBe('mocha');

    const visualCroissant = getProductVisual({
      name_ar: 'كرواسون زبدة فرنسي',
      category_name: 'مخبوزات',
    });
    expect(visualCroissant.icon).toBe('croissant');
    expect(visualCroissant.colorTheme).toBe('gold');
  });

  it('provides category visual mapping correctly', () => {
    const catVisual = getCategoryVisual('مشروبات باردة');
    expect(catVisual.icon).toBe('cupSoda');
    expect(catVisual.emoji).toBe('🧊');
    expect(catVisual.theme).toBe('ice');
  });

  it('defines all required theme colors', () => {
    expect(PRODUCT_THEMES.espresso).toBeDefined();
    expect(PRODUCT_THEMES.gold).toBeDefined();
    expect(PRODUCT_THEMES.mocha).toBeDefined();
    expect(PRODUCT_THEMES.ice).toBeDefined();
    expect(PRODUCT_THEMES.berry).toBeDefined();
    expect(PRODUCT_THEMES.emerald).toBeDefined();
    expect(PRODUCT_THEMES.amber).toBeDefined();
    expect(PRODUCT_THEMES.cream).toBeDefined();
    expect(PRODUCT_THEMES.sunset).toBeDefined();
    expect(PRODUCT_THEMES.caramel).toBeDefined();
  });

  it('assigns 3D image paths for coffee, drinks, beans, and bakery', () => {
    const coffee = getProductVisual({ name_ar: 'إسبريسو سينجل' });
    expect(coffee.threeDImage).toBe('/3d-icons/coffee-hot.jpg');

    const iced = getProductVisual({ name_ar: 'آيس موكا مثلج' });
    expect(iced.threeDImage).toBe('/3d-icons/iced-drink.jpg');

    const beans = getProductVisual({ name_ar: 'حبوب بن كولومبي' });
    expect(beans.threeDImage).toBe('/3d-icons/beans.jpg');

    const croissant = getProductVisual({ name_ar: 'كرواسون شوكولاتة' });
    expect(croissant.threeDImage).toBe('/3d-icons/bakery-croissant.jpg');
  });
});
