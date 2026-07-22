import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
// Derives a 32-byte key from the environment secret or default salt
const ENCRYPTION_KEY = crypto.scryptSync(
    process.env.BACKUP_ENCRYPTION_KEY || 'bin_al_ajouz_erp_secret_salt_2026', 
    'salt_al_ajouz', 
    32
);
const IV_LENGTH = 16;

export const encrypt = (text) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
};

export const decrypt = (text) => {
    const textParts = text.split(':');
    if (textParts.length < 2) {
        throw new Error('صيغة التشفير غير صحيحة أو الملف تالف');
    }
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};
