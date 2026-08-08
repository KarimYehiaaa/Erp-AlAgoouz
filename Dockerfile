FROM node:20-alpine

WORKDIR /app

# نسخ ملفات الـ package.json لتثبيت المكتبات
COPY package.json ./
COPY backend/package.json ./backend/

# تثبيت المكتبات للـ backend والـ root
RUN npm install
RUN cd backend && npm install

# نسخ ملفات المشروع بالكامل
COPY . .

# دعم المنفذ المرن (افتراضي 7860 لـ Hugging Face و3000 للمحلي)
ARG PORT=7860
ENV PORT=${PORT}
EXPOSE 7860 3000

# تشغيل السيرفر
CMD ["npm", "start"]
