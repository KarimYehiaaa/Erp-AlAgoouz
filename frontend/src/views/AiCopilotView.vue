<template>
  <div class="copilot-container">
    <!-- Header -->
    <div class="page-header card glass-header">
      <div class="header-title">
        <span class="header-icon sparkles-anim"></span>
        <div>
          <h2>المساعد المالي والتشغيلي الذكي</h2>
          <p>
            استشر الذكاء الاصطناعي حول المبيعات والمصاريف وإدارة المقهى بناءً على بياناتك الحقيقية
          </p>
        </div>
      </div>
      <div class="header-status">
        <span class="status-indicator online"></span>
        <span class="status-text">متصل ومستعد</span>
        <button
          @click="clearChat"
          class="btn btn-outline btn-sm clear-btn"
          title="مسح محادثة اليوم"
        >
          <span></span> مسح المحادثة
        </button>
      </div>
    </div>

    <!-- Main Chat Window -->
    <div class="chat-wrapper card">
      <!-- Welcome screen when history is empty -->
      <div v-if="history.length === 0" class="welcome-screen">
        <div class="welcome-icon"></div>
        <h3>أهلاً بك في المساعد الذكي لـ "بن العجوز"</h3>
        <p>
          يمكنني مساعدتك في تحليل أداء المبيعات، ومراقبة المصاريف، وتوقع نسب الازدحام، وتقديم
          استشارات لنمو المقهى.
        </p>

        <div class="suggested-prompts-grid">
          <div
            v-for="(prompt, idx) in suggestedPrompts"
            :key="idx"
            class="prompt-card"
            @click="sendSuggestedPrompt(prompt.text)"
          >
            <span class="prompt-icon">{{ prompt.icon }}</span>
            <div class="prompt-info">
              <h4>{{ prompt.title }}</h4>
              <p>{{ prompt.text }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Messages Area -->
      <div v-else class="messages-area" ref="messagesArea">
        <div
          v-for="(msg, index) in history"
          :key="index"
          class="message-row"
          :class="msg.role === 'user' ? 'user-row' : 'assistant-row'"
        >
          <div class="avatar">
            {{ msg.role === 'user' ? '' : '' }}
          </div>
          <div class="message-bubble" :class="msg.role">
            <div class="message-content" v-html="formatMessage(msg.content)"></div>
            <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
          </div>
        </div>

        <!-- Typing Indicator -->
        <div v-if="loading" class="message-row assistant-row">
          <div class="avatar"></div>
          <div class="message-bubble assistant typing-bubble">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Bar & Chips -->
      <div class="chat-footer">
        <!-- Floating chips for quick follow ups -->
        <div v-if="history.length > 0 && !loading" class="follow-up-chips">
          <button
            v-for="(chip, idx) in quickChips"
            :key="idx"
            @click="sendSuggestedPrompt(chip)"
            class="chip-btn"
          >
            {{ chip }}
          </button>
        </div>

        <!-- Input Area -->
        <form @submit.prevent="submitMessage" class="input-form">
          <textarea
            v-model="inputText"
            @keydown.enter.exact.prevent="submitMessage"
            placeholder="اكتب سؤالك المالي أو التشغيلي هنا... (مثال: ما هو تقرير المبيعات والمصاريف للـ 30 يوماً الماضية؟)"
            rows="1"
            ref="inputArea"
            :disabled="loading"
            @input="adjustTextareaHeight"
          ></textarea>
          <button
            type="submit"
            class="btn btn-primary send-btn"
            :disabled="!inputText.trim() || loading"
          >
            <span v-if="loading">جاري التفكير...</span>
            <span v-else>إرسال </span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import DOMPurify from 'dompurify';
import { forecasting } from '@/api';

const inputText = ref('');
const loading = ref(false);
const history = ref<any[]>([]);
const messagesArea = ref<any>(null);
const inputArea = ref<any>(null);

const suggestedPrompts = [
  {
    icon: '',
    title: 'أداء المبيعات والمصاريف',
    text: 'أعطني ملخصاً شاملاً للمبيعات والمصاريف وصافي الربح في آخر 30 يوماً.',
  },
  {
    icon: '⏳',
    title: 'توقع أوقات الذروة',
    text: 'ما هي أكثر الساعات والمستويات ازدحاماً خلال الأسبوع وما هي توصيتك للشيفتات؟',
  },
  {
    icon: '',
    title: 'التسعير وهامش الربح',
    text: 'هل هناك مشروبات أو منتجات تباع بهامش ربح منخفض بناءً على أسعار التكلفة؟',
  },
  {
    icon: '',
    title: 'توصيات لزيادة الأرباح',
    text: 'كيف يمكنني تقليل الفاقد في الحليب والبن وزيادة متوسط قيمة سلة الشراء للمقهى؟',
  },
];

const quickChips = ref([
  'ما هي المنتجات الأكثر مبيعاً؟',
  'أريد تفاصيل المصاريف هذا الشهر',
  'ما توصيتك لأسعار المشروبات منخفضة الهامش؟',
  'كيف أوزع العمالة في أوقات الذروة؟',
]);

onMounted(() => {
  // Load chat history from localStorage if exists
  const saved = localStorage.getItem('alagoouz_copilot_history');
  if (saved) {
    try {
      history.value = JSON.parse(saved);
      scrollToBottom();
    } catch {
      localStorage.removeItem('alagoouz_copilot_history');
    }
  }
});

const formatTime = (ts: any) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
};

const formatMessage = (text: any) => {
  if (!text) return '';

  // Basic markdown parsing
  let html = text;

  // Escape HTML entities to prevent XSS
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Restore line breaks
  html = html.replace(/\n/g, '<br>');

  // Bold text: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Bullet points
  html = html.replace(/^(?:&lt;br&gt;)?\s*[-*•]\s+(.*?)(?=&lt;br&gt;|$)/gm, '<li>$1</li>');
  // Wrap list items in <ul>
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul class="chat-list">$1</ul>');

  // Headers: ### Text
  html = html.replace(/###\s+(.*?)(?=<br>|$)/g, '<h4 class="chat-h4">$1</h4>');
  html = html.replace(/##\s+(.*?)(?=<br>|$)/g, '<h3 class="chat-h3">$1</h3>');

  // Highlight numbers, percentages and currencies for premium finance look
  html = html.replace(
    /(\b\d+(?:\.\d+)?\s*(?:%|ج\.م|جنيه|ريال|دولار|طلب|كوب|ساعة|شيفت)?\b)/g,
    '<span class="finance-metric">$1</span>',
  );

  return DOMPurify.sanitize(html);
};

const sendSuggestedPrompt = (text: any) => {
  inputText.value = text;
  submitMessage();
};

const submitMessage = async () => {
  const text = inputText.value.trim();
  if (!text || loading.value) return;

  // Add user message
  const userMsg = {
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
  };
  history.value.push(userMsg);
  inputText.value = '';
  loading.value = true;

  if (inputArea.value) {
    inputArea.value.style.height = 'auto';
  }

  scrollToBottom();

  try {
    // Call the API endpoint
    // Prepare history payload for API (role & content)
    const apiHistory = history.value.slice(0, -1).map((h: any) => ({
      role: h.role,
      content: h.content,
    }));

    const response = await forecasting.askCopilot({
      prompt: text,
      history: apiHistory,
    });

    const assistantMsg = {
      role: 'model',
      content: response.data?.reply || 'لم أتمكن من الحصول على رد.',
      timestamp: new Date().toISOString(),
    };

    history.value.push(assistantMsg);
    // Save to local storage
    localStorage.setItem('alagoouz_copilot_history', JSON.stringify(history.value));
  } catch (error: any) {
    console.error(error);
    history.value.push({
      role: 'model',
      content:
        'عذراً، واجهت مشكلة في الاتصال بالخادم الذكي. يرجى التحقق من اتصال قاعدة البيانات ومفتاح Gemini API بالخلفية.',
      timestamp: new Date().toISOString(),
      isError: true,
    });
  } finally {
    loading.value = false;
    scrollToBottom();
    // Auto-focus input
    nextTick(() => {
      inputArea.value?.focus();
    });
  }
};

const clearChat = () => {
  if (confirm('هل أنت متأكد من مسح تاريخ المحادثة؟')) {
    history.value = [];
    localStorage.removeItem('alagoouz_copilot_history');
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesArea.value) {
      messagesArea.value.scrollTop = messagesArea.value.scrollHeight;
    }
  });
};

const adjustTextareaHeight = () => {
  const el = inputArea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
};
</script>

<style lang="scss" scoped>
.copilot-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--navbar-height) - 40px);
  gap: 16px;
  direction: rtl;
}

.glass-header {
  background: var(--header-bg);
  border: 1px solid var(--card-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 24px;
}

.header-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  &.online {
    background-color: var(--success);
    box-shadow: 0 0 10px var(--success);
  }
}

.status-text {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted);
}

.clear-btn {
  margin-right: 12px;
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.2);
  color: var(--danger);

  &:hover {
    background: var(--danger);
    color: #fff;
  }
}

.chat-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--card-border);
  background: var(--bg-card);
  position: relative;
}

/* Welcome Screen */
.welcome-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40px var(--space-6);
  overflow-y: auto;

  .welcome-icon {
    font-size: 3.5rem;
    margin-bottom: 16px;
    animation: bounce 3s infinite ease-in-out;
  }

  h3 {
    font-size: 1.5rem;
    font-weight: 900;
    color: var(--text-strong);
    margin-bottom: 8px;
  }

  p {
    color: var(--text-muted);
    max-width: 600px;
    margin-bottom: 32px;
    font-size: 0.95rem;
    line-height: 1.6;
  }
}

.suggested-prompts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  max-width: 800px;
  width: 100%;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.prompt-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-align: right;
  cursor: pointer;
  transition: all var(--transition);

  &:hover {
    background: var(--surface-3);
    border-color: var(--primary-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  .prompt-icon {
    font-size: 1.8rem;
    display: flex;
    align-items: center;
  }

  .prompt-info {
    h4 {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--text-strong);
      margin-bottom: 4px;
    }
    p {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.4;
    }
  }
}

/* Messages Area */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: radial-gradient(circle at 50% 50%, rgba(23, 107, 91, 0.02) 0%, transparent 100%);
}

.message-row {
  display: flex;
  gap: 12px;
  max-width: 85%;
  align-items: flex-start;

  .avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--surface-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    box-shadow: var(--shadow-xs);
    flex-shrink: 0;
  }

  &.user-row {
    align-self: flex-start;
    flex-direction: row-reverse;

    .message-bubble {
      background: var(--primary);
      color: #fff;
      border-top-left-radius: 2px;
      box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 24%, transparent);
    }
  }

  &.assistant-row {
    align-self: flex-end;

    .message-bubble {
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--text);
      border-top-right-radius: 2px;
      box-shadow: var(--shadow-xs);
    }
  }
}

.message-bubble {
  padding: 12px 18px;
  border-radius: var(--radius-xl);
  position: relative;
  font-size: 0.95rem;
  line-height: 1.6;

  .message-time {
    font-size: 0.72rem;
    margin-top: 6px;
    text-align: left;
    opacity: 0.75;
  }
}

/* Typing indicator */
.typing-bubble {
  padding: 16px 20px;
}

.typing-indicator {
  display: flex;
  gap: 6px;

  span {
    width: 8px;
    height: 8px;
    background: var(--primary-strong);
    border-radius: 50%;
    animation: typing 1.4s infinite ease-in-out both;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }
    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

/* Chat Footer */
.chat-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}

.follow-up-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 12px;
  margin-bottom: 4px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  .chip-btn {
    white-space: nowrap;
    padding: 6px 14px;
    border-radius: 50px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all var(--transition);

    &:hover {
      background: var(--primary-soft);
      border-color: var(--primary-strong);
      color: var(--primary-dark);
    }
  }
}

.input-form {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 8px 12px;
  transition:
    border-color var(--transition),
    box-shadow var(--transition);

  &:focus-within {
    border-color: var(--primary-strong);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  textarea {
    flex: 1;
    border: 0;
    background: transparent;
    padding: 8px 4px;
    resize: none;
    font-family: inherit;
    font-size: 0.95rem;
    max-height: 120px;
    color: var(--text);
    outline: none;
    line-height: 1.5;

    &::placeholder {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
  }

  .send-btn {
    padding: 8px 20px;
    border-radius: var(--radius-lg);
    font-weight: 800;
    font-size: 0.9rem;
    height: 40px;
  }
}

/* Sparkles animation */
.sparkles-anim {
  display: inline-block;
  animation: rotateSparkle 4s linear infinite;
}

@keyframes rotateSparkle {
  0% {
    transform: scale(1) rotate(0deg);
  }
  50% {
    transform: scale(1.15) rotate(180deg);
  }
  100% {
    transform: scale(1) rotate(360deg);
  }
}

@keyframes typing {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  45% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
</style>

<!-- Global helper classes inside scope -->
<style lang="scss">
.chat-list {
  padding-right: 20px;
  margin: 8px 0;

  li {
    margin-bottom: 4px;
    list-style-type: square;
  }
}

.chat-h3 {
  font-size: 1.15rem;
  font-weight: 900;
  margin: 14px 0 8px;
  color: inherit;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
  padding-bottom: 4px;
}

.chat-h4 {
  font-size: 1.05rem;
  font-weight: 800;
  margin: 10px 0 6px;
  color: inherit;
}

.finance-metric {
  font-family: 'Courier New', Courier, monospace;
  font-weight: 800;
  color: var(--accent);
  background: rgba(182, 106, 44, 0.08);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  display: inline-block;
  direction: ltr;
}

.assistant .finance-metric {
  color: var(--primary-strong);
  background: var(--primary-soft);
}
</style>
