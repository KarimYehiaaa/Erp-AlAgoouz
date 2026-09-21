<template>
  <section class="overview-grid" style="margin-top: var(--space-5)">
    <article class="panel chart-panel wide">
      <div class="panel-head">
        <div>
          <h2>
            <AppIcon name="reports" style="margin-left: 8px; color: var(--primary)" />
            مصفوفة كفاءة وهندسة الأصناف (Menu Matrix)
          </h2>
          <p>تصنيف ذكي لأصناف المشروبات بناءً على كفاءة المبيعات وهامش الربحية</p>
        </div>
        <span
          class="badge badge-warning"
          style="background: var(--accent); color: var(--bg-elevated); font-weight: 800"
          >تحليل نشط</span
        >
      </div>
      <div class="menu-engineering-grid">
        <div class="menu-matrix-quadrant star">
          <div class="quadrant-header">
            <span class="quadrant-badge"> النجوم (Star)</span>
            <span class="quadrant-desc">أصناف عالية الربحية والطلب</span>
          </div>
          <ul class="quadrant-list">
            <li>إسبريسو دبل</li>
            <li>سبانش لاتيه بارد</li>
            <li>كورتادو</li>
          </ul>
        </div>
        <div class="menu-matrix-quadrant plowhorse">
          <div class="quadrant-header">
            <span class="quadrant-badge"> الحصان (Plowhorse)</span>
            <span class="quadrant-desc">شعبية عالية بربحية أقل</span>
          </div>
          <ul class="quadrant-list">
            <li>قهوة تركي بن العجوز</li>
            <li>مياه معدنية طبيعية</li>
          </ul>
        </div>
        <div class="menu-matrix-quadrant puzzle">
          <div class="quadrant-header">
            <span class="quadrant-badge"> الألغاز (Puzzle)</span>
            <span class="quadrant-desc">ربحية عالية وشعبية منخفضة</span>
          </div>
          <ul class="quadrant-list">
            <li>V60 بن كولومبي فاخر</li>
            <li>كيكة كراميل دافئة</li>
          </ul>
        </div>
        <div class="menu-matrix-quadrant dog">
          <div class="quadrant-header">
            <span class="quadrant-badge"> الأصناف الراكدة (Dog)</span>
            <span class="quadrant-desc">ربحية منخفضة وطلب راكد</span>
          </div>
          <ul class="quadrant-list">
            <li>عصير معلبات عادي</li>
            <li>شاي أسود رخيص</li>
          </ul>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
// Later we can pass dynamic `menuMatrix` stats from backend here.
</script>

<style lang="scss" scoped>
@use './dashboardShared.scss';

/* Menu Matrix (BCG Matrix style for restaurant engineering) */
.menu-engineering-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 16px;
  padding: 16px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  margin-top: 16px;
}

.menu-matrix-quadrant {
  padding: 16px;
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  &.star {
    border-top: 3px solid var(--success);
  }
  &.plowhorse {
    border-top: 3px solid var(--primary);
  }
  &.puzzle {
    border-top: 3px solid var(--warning);
  }
  &.dog {
    border-top: 3px solid var(--danger);
    opacity: 0.8;
  }
}

.quadrant-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quadrant-badge {
  font-weight: 900;
  font-size: 1.05rem;
  color: var(--text-strong);
}

.quadrant-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.quadrant-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  li {
    font-size: 0.88rem;
    color: var(--text);
    background: var(--bg-elevated);
    padding: 6px 12px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    &::before {
      content: '•';
      color: var(--accent);
      margin-left: 6px;
      font-weight: bold;
    }
  }
}
</style>
