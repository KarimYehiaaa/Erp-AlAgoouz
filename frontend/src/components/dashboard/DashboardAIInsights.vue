<template>
  <section class="overview-grid" style="margin-top: var(--space-5)">
    <article class="panel chart-panel wide">
      <div class="panel-head">
        <div>
          <h2>
            <AppIcon name="copilot" style="margin-left: 8px; color: var(--primary)" />
            رادار تحليلات التشغيل (AI Insights)
          </h2>
          <p>مؤشرات تلقائية تم توليدها بالاعتماد على مبيعات ومخازن النظام</p>
        </div>
        <span class="badge badge-info">نشط</span>
      </div>
      <div class="insights-list">
        <div v-for="ins in aiInsights" :key="ins.title" class="insight-item" :class="ins.tone">
          <span class="insight-icon">{{ ins.icon }}</span>
          <div class="insight-body">
            <strong>{{ ins.title }}</strong>
            <p>{{ ins.text }}</p>
          </div>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  stats: { type: Object, required: true },
});

const aiInsights = computed(() => {
  const insights: any[] = [];
  if (!props.stats) return insights;

  const stockAlerts = Number(props.stats.stockAlerts || 0);
  if (stockAlerts > 0) {
    insights.push({
      title: 'مراجعة طلبات التوريد',
      text: `يوجد ${stockAlerts} منتجات تقل كميتها عن حد الطلب. نقترح مراجعة صفحة المخزون وإعداد طلبات التوريد لتفادي النقص.`,
      icon: '⚠️',
      tone: 'danger',
    });
  } else {
    insights.push({
      title: 'استقرار المخزون',
      text: 'جميع المنتجات الأساسية أعلى من حد الأمان حالياً. لا يوجد خطر نقص وشيك.',
      icon: '✅',
      tone: 'success',
    });
  }

  const collectionRate = Number(props.stats.month?.collectionRate || 0);
  if (collectionRate < 80) {
    insights.push({
      title: 'تنبيه التدفقات النقدية (آجل مرتفع)',
      text: `نسبة تحصيل المبيعات الآجلة للشهر الحالي منخفضة (${collectionRate.toFixed(1)}%). نوصي بالتواصل مع العملاء الذين لديهم مديونيات متأخرة لزيادة التدفقات النقدية.`,
      icon: '💳',
      tone: 'warning',
    });
  } else {
    insights.push({
      title: 'كفاءة التحصيل المالي',
      text: `معدل تحصيل ممتاز للمبيعات الآجلة للشهر الحالي يبلغ ${collectionRate.toFixed(1)}%. استمر على هذا الأداء.`,
      icon: '💰',
      tone: 'success',
    });
  }

  const shortageRecipes = Number(props.stats.recipeSummary?.shortageRecipes || 0);
  if (shortageRecipes > 0) {
    insights.push({
      title: 'عائق تصنيعي محتمل',
      text: `يوجد ${shortageRecipes} وصفة تحتوي على مواد أولية قاربت على النفاد، مما قد يعطل إنتاج هذه الدفعات.`,
      icon: '🥣',
      tone: 'warning',
    });
  }

  const salesCount = Number(props.stats.month?.salesCount || 0);
  if (salesCount > 100) {
    insights.push({
      title: 'معدل نشاط مرتفع',
      text: `سجل النظام ${salesCount} عملية بيع خلال هذه الفترة. نقترح مراقبة ساعات الذروة (بين 4 و 7 مساءً) لتنظيم العمالة بشكل أفضل.`,
      icon: '🔥',
      tone: 'info',
    });
  }

  return insights;
});
</script>

<style lang="scss" scoped>
/* Insights List */
.insights-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.insight-item {
  display: flex;
  gap: 16px;
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  &.success {
    border-color: color-mix(in srgb, var(--success) 30%, transparent);
    background: color-mix(in srgb, var(--success) 3%, transparent);
  }
  &.warning {
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
    background: color-mix(in srgb, var(--warning) 3%, transparent);
  }
  &.danger {
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    background: color-mix(in srgb, var(--danger) 3%, transparent);
  }
  &.info {
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    background: color-mix(in srgb, var(--primary) 3%, transparent);
  }
}

.insight-icon {
  font-size: 1.5rem;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.insight-body {
  display: flex;
  flex-direction: column;
  gap: 6px;

  strong {
    font-size: 1rem;
    color: var(--text-strong);
  }

  p {
    font-size: 0.88rem;
    color: var(--text-muted);
    line-height: 1.6;
    margin: 0;
  }
}
</style>
