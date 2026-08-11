FROM node:22-alpine

WORKDIR /app

# نسخ ملفات الـ package.json لتثبيت المكتبات
COPY --chown=node:node package.json ./
COPY --chown=node:node backend/package.json ./backend/

# تثبيت المكتبات للـ backend والـ root
RUN npm install
RUN cd backend && npm install
RUN cd frontend && npm install

# نسخ ملفات المشروع بالكامل
COPY --chown=node:node . .

# بناء الواجهة
RUN cd frontend && npm run build

# دعم المنفذ المرن
ARG PORT=3000
ENV PORT=${PORT}
EXPOSE 3000

# تشغيل السيرفر بصلاحيات مستخدم عادي (أمان أفضل)
USER node
CMD ["npm", "start"]
