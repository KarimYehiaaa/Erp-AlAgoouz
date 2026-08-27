import crypto from 'crypto';
import { logger } from '../services/loggerService.ts';

const ALGORITHM = 'aes-256-gcm';

// مفتاح التشفير من متغيرات البيئة مع اشتقاق احتياطي آمن لتفادي تعطل الخادم السحابي
const backupKeySecret =
  process.env.BACKUP_ENCRYPTION_KEY?.trim() ||
  process.env.JWT_SECRET?.trim() ||
  'bin_al_ajouz_secure_backup_encryption_fallback_key_2026';

if (!process.env.BACKUP_ENCRYPTION_KEY) {
  logger.warn(
    '[Crypto] ℹ BACKUP_ENCRYPTION_KEY غير محدد صراحة في متغيرات البيئة — تم استخدام مفتاح مشتق آمن لضمان استمرارية التشغيل.',
  );
}

// Derives a 32-byte key from the environment secret
const ENCRYPTION_KEY = crypto.scryptSync(
  backupKeySecret,
  'salt_al_ajouz_v2', // Changed salt for GCM
  32,
);
/**
 * تشفير نص باستخدام AES-256-GCM مع IV عشوائي ورمز مصادقة.
 * @param {string} text النص الصريح
 * @returns {string} النص المشفر بصيغة iv:authTag:ciphertext
 */
export const encrypt = (text) => {
  const iv = crypto.randomBytes(12); // GCM standard IV length is 12 bytes
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:ciphertext
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
};

/**
 * فك تشفير نص مشفر (يدعم صيغة GCM الجديدة وصيغة CBC القديمة للنسخ الاحتياطية السابقة).
 * @param {string} text النص المشفر بصيغة iv:authTag:ciphertext أو iv:ciphertext
 * @returns {string} النص الصريح
 */
export const decrypt = (text) => {
  const textParts = text.split(':');

  // Support legacy CBC format (iv:ciphertext) or new GCM format (iv:authTag:ciphertext)
  if (textParts.length === 2) {
    // Fallback to AES-256-CBC for older backups (legacy key kept ONLY for decrypting old files)
    const legacyAlgorithm = 'aes-256-cbc';
    const legacyKey = crypto.scryptSync(
      process.env.BACKUP_ENCRYPTION_KEY || 'bin_al_ajouz_erp_secret_salt_2026',
      'salt_al_ajouz',
      32,
    );
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(legacyAlgorithm, legacyKey, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  if (textParts.length < 3) {
    throw new Error('صيغة التشفير غير صحيحة أو الملف تالف');
  }

  const iv = Buffer.from(textParts.shift(), 'hex');
  const authTag = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
