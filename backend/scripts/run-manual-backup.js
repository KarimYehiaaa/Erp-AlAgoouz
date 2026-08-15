import { createBackup } from '../src/services/backupService.ts';
import dotenv from 'dotenv';
import path from 'path';

// تحميل متغيرات البيئة من ملف .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    try {
        console.log('🔄 جاري البدء في أخذ نسخة احتياطية يدوية لقاعدة البيانات...');
        const result = await createBackup();
        console.log('✅ تم النسخ الاحتياطي بنجاح!');
        console.log(`📂 اسم الملف: ${result.file}`);
        console.log(`📍 مسار الملف الكامل: ${result.path}`);
    } catch (error) {
        console.error('❌ فشل النسخ الاحتياطي:', error);
        process.exit(1);
    }
}

main();
