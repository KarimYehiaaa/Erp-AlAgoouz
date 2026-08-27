/**
 * utils/automationGraphLayout.ts — حسابات المواقع ثلاثية الأبعاد لعقد شبكة الأتمتة
 * ═══════════════════════════════════════════════════════════════════════════════
 * دوال رياضية نقية (بلا WebGL) قابلة للاختبار المباشر:
 *   - computeGraphLayout: توزيع العقد في الفضاء حسب نمط التوزيع الثلاثي.
 *   - buildCurveControlPoint: نقطة انحناء وصل بين عقدتين (لأقواس التدفق).
 */

export type LayoutMode = 'obsidian' | 'orbit' | 'matrix';

export interface LayoutNodeInput {
  id: string;
  kind: 'trigger' | 'engine' | 'agent' | 'channel';
  category?: string;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const CATEGORY_CLUSTER_ANGLES: Record<string, number> = {
  sales: -Math.PI / 4,
  inventory: Math.PI / 4,
  security: (3 * Math.PI) / 4,
  system: (-3 * Math.PI) / 4,
};

const AGENT_RADIUS = 11;

/** توزيع ثلاثي الأبعاد كامل للشبكة حسب النمط */
export function computeGraphLayout(nodes: LayoutNodeInput[], mode: LayoutMode): Map<string, Vec3> {
  const positions = new Map<string, Vec3>();
  if (!nodes.length) return positions;

  const agents = nodes.filter((n) => n.kind === 'agent');
  const trigger = nodes.find((n) => n.kind === 'trigger');
  const engine = nodes.find((n) => n.kind === 'engine');
  const channels = nodes.filter((n) => n.kind === 'channel');

  // البنية التحتية ثابتة في كل الأنماط: المحرك مركز، البوت أعلى، القنوات على الأجناب
  if (engine) positions.set(engine.id, { x: 0, y: 0, z: 0 });
  if (trigger) positions.set(trigger.id, { x: 0, y: 7.5, z: -13 });
  channels.forEach((ch, i) => {
    const angle = (i / Math.max(channels.length, 1)) * Math.PI * 2 + Math.PI / channels.length;
    positions.set(ch.id, {
      x: Math.cos(angle) * 17,
      y: 4.5,
      z: Math.sin(angle) * 17,
    });
  });

  agents.forEach((node, idx) => {
    let pos: Vec3;
    switch (mode) {
      case 'obsidian': {
        // عناقيد فئات في أرباع الفضاء مع عمق متدرج
        const baseAngle = CATEGORY_CLUSTER_ANGLES[node.category || 'general'] ?? idx * 0.9;
        const clusterPeers = agents.filter(
          (a) => (a.category || 'general') === (node.category || 'general'),
        );
        const rankInCluster = clusterPeers.findIndex((a) => a.id === node.id);
        const spread = clusterPeers.length > 1 ? (rankInCluster - (clusterPeers.length - 1) / 2) * 0.34 : 0;
        const angle = baseAngle + spread;
        const radius = AGENT_RADIUS + ((idx % 3) - 1) * 2.2;
        pos = {
          x: Math.cos(angle) * radius,
          y: 1.6 + (idx % 4) * 0.85,
          z: Math.sin(angle) * radius,
        };
        break;
      }
      case 'orbit': {
        // حلقتان مداريتين مائلتان حول المحرك
        const isOuter = idx % 2 === 1;
        const radius = isOuter ? 15 : 9.5;
        const step = (Math.PI * 2) / Math.max(agents.length, 1);
        const angle = idx * step - Math.PI / 2;
        pos = {
          x: Math.cos(angle) * radius,
          y: isOuter ? 3.4 : 1.2,
          z: Math.sin(angle) * radius * (isOuter ? 0.82 : 1),
        };
        break;
      }
      case 'matrix':
      default: {
        // مصفوفة شبكية متوازنة (4 أعمدة)
        const cols = Math.min(agents.length, 4);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const spacingX = 6.4;
        const spacingZ = 6.4;
        const offsetX = ((cols - 1) * spacingX) / 2;
        const offsetZ = 4;
        pos = {
          x: col * spacingX - offsetX,
          y: 1.5,
          z: row * spacingZ + offsetZ,
        };
        break;
      }
    }
    positions.set(node.id, pos);
  });

  return positions;
}

/** نقطة تحكم منتصف القوس بين عقدتين — ترفع الانحناء للأعلى لمظهر تدفق أنيق */
export function buildCurveControlPoint(from: Vec3, to: Vec3): Vec3 {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const midZ = (from.z + to.z) / 2;
  const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  return { x: midX, y: midY + Math.max(dist * 0.18, 1.2), z: midZ };
}
