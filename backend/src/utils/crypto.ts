import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// Safe fallback for BACKUP_ENCRYPTION_KEY to ensure serverless boot
const backupKeySecret = process.env.BACKUP_ENCRYPTION_KEY || 'agoouz_default_backup_key_2026';

// Derives a 32-byte key from the environment secret
const ENCRYPTION_KEY = crypto.scryptSync(
  backupKeySecret,
  'salt_al_ajouz_v2', // Changed salt for GCM
  32,
);
const IV_LENGTH = 16; // 12 is standard for GCM, but 16 is acceptable. We use 12 for GCM.

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
    // Fallback to AES-256-CBC for older backups
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
