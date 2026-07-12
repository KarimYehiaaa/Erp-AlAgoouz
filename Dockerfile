FROM node:18-alpine

WORKDIR /app

# نسخ ملفات الـ package.json لتثبيت المكتبات
COPY package.json ./
COPY backend/package.json ./backend/

# تثبيت المكتبات للـ backend والـ root
RUN npm install
RUN cd backend && npm install

# نسخ ملفات المشروع بالكامل (التي تحتوي على frontend/dist المسبق بناؤه)
COPY . .

# Hugging Face يتطلب الاستماع للبورت 7860
ENV PORT=7860
EXPOSE 7860

# تشغيل السيرفر
CMD ["npm", "start"]
