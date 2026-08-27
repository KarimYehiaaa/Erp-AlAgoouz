/**
 * services/agentService.ts — حلقة تنفيذ وكلاء الذكاء الاصطناعي
 * تحاول الاتصال بالخادم الحقيقي (نقطة copilot) عند توفرها، وإلا تعمل
 * بمحرك محاكاة محلي حتمي حتى يعمل المنظّم كاملاً بدون مفاتيح.
 */
import api from '@/api/client';

export interface AgentRunInput {
  model: string;
  systemPrompt: string;
  temperature: number;
  memory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  input: string;
  tools?: boolean;
}

export interface AgentRunResult {
  reply: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  live: boolean;
}

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 3.6));

/** استدعاء حقيقي عبر نقطة copilot الموجودة في الباكند (Gemini) */
async function runLive(input: AgentRunInput): Promise<AgentRunResult | null> {
  try {
    const started = Date.now();
    const res = await api.post(
      '/forecasting/copilot',
      {
        question: input.input,
        context: { systemPrompt: input.systemPrompt, temperature: input.temperature },
      },
      { timeout: 30_000 },
    );
    const payload = res.data?.data || res.data || {};
    const reply = payload.reply || payload.answer || payload.message;
    if (!reply) return null;
    return {
      reply,
      model: 'gemini-flash (backend)',
      tokensIn: estimateTokens(input.systemPrompt + input.input),
      tokensOut: estimateTokens(reply),
      latencyMs: Date.now() - started,
      live: true,
    };
  } catch {
    return null;
  }
}

/** محرك المحاكاة المحلي — ردود حتمية مفيدة للعرض والاختبار */
function simulate(input: AgentRunInput): AgentRunResult {
  const started = Date.now();
  const trimmed = input.input.trim() || 'رسالة فارغة';
  const isQuestion = trimmed.includes('؟') || trimmed.includes('?');
  const topic = trimmed.split(/\s+/).slice(0, 6).join(' ');

  let reply: string;
  if (/سعر|اسعار|أسعار|price/i.test(trimmed)) {
    reply = `أسعار قائمة البن لدينا تبدأ من ١٨٠ ج.م للكيلو الأخضر. بخصوص «${topic}» — أرسل لك القائمة الكاملة على تليجرام فوراً.`;
  } else if (/تقرير|مبيعات|report|sales/i.test(trimmed)) {
    reply = `تقرير سريع بخصوص «${topic}»: مبيعات اليوم ضمن النطاق المتوقع، وهامش الربح مستقر. أرصد التفاصيل الكاملة في تقرير الإغلاق ١١:٣٠ مساءً.`;
  } else if (isQuestion) {
    reply = `سؤالك عن «${topic}»: بناءً على سياسة المحل، الجواب المختصر هو أننا نستطيع تلبية طلبك اليوم، وسأؤكد التفاصيل مع الفريق وأعود إليك خلال دقائق.`;
  } else {
    reply = `تم استلام طلبك بخصوص «${topic}». سأتابع الأمر وأخبرك بالتحديثات فوراً.`;
  }

  if (input.tools) reply += '\n[tools: crm.lookup ✓, inventory.check ✓]';

  return {
    reply,
    model: `${input.model} (محاكاة)`,
    tokensIn: estimateTokens(input.systemPrompt) + estimateTokens(input.input),
    tokensOut: estimateTokens(reply),
    latencyMs: Date.now() - started,
    live: false,
  };
}

/**
 * تنفيذ الوكيل: يحاول الخادم أولاً ثم يسقط للمحاكاة.
 * @param useLive فعّل الاستدعاء الشبكي (معطل افتراضياً في وضع التصميم)
 */
export async function runAgent(
  input: AgentRunInput,
  opts: { useLive?: boolean } = {},
): Promise<AgentRunResult> {
  if (opts.useLive) {
    const live = await runLive(input);
    if (live) return live;
  }
  // محاكاة زمن استجابة واقعي قصير
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 450));
  return simulate(input);
}
