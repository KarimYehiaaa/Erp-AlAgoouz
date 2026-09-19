import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

const isProd = process.env.NODE_ENV === 'production';
const rawBackupKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();

if (isProd && (!rawBackupKey || rawBackupKey.length < 32)) {
  throw new Error(
    '[Security Error] BACKUP_ENCRYPTION_KEY is strictly required and must be at least 32 characters long in production.',
  );
}

const backupKeySecret =
  rawBackupKey || (isProd ? '' : 'dev_backup_encryption_secret_key_32_chars_long!');

// Derives a 32-byte key from the environment secret
const ENCRYPTION_KEY = crypto.scryptSync(
  backupKeySecret,
  'salt_al_ajouz_v2', // Salt for GCM
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
    const legacySecret = process.env.BACKUP_ENCRYPTION_KEY?.trim();
    if (!legacySecret) {
      throw new Error(
        'لا يمكن فك تشفير نسخة احتياطية قديمة بدون BACKUP_ENCRYPTION_KEY. اضبط المفتاح نفسه المستخدم عند إنشاء النسخة.',
      );
    }
    const legacyAlgorithm = 'aes-256-cbc';
    const legacyKey = crypto.scryptSync(legacySecret, 'salt_al_ajouz', 32);
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
