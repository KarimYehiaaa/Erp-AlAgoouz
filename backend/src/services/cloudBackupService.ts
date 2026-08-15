import crypto from 'crypto';
import { query } from '../database/pool.ts';
import * as backupService from './backupService.ts';
import { AppError } from '../types/errors.ts';
import { decrypt } from '../utils/crypto.ts';

/**
 * @param {string} str
 * @param {string} [encoding]
 */
function base64url(str, encoding = 'utf8') {
  return Buffer.from(str, encoding as any)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * الحصول على Access Token من Google Drive باستخدام حساب خدمة (JWT).
 * @param {string | Record<string, any>} serviceAccountJson بيانات حساب الخدمة
 * @returns {Promise<string>}
 */
export async function getGoogleDriveAccessToken(serviceAccountJson: string | Record<string, any>) {
  /** @type {any} */
  let keyData;
  try {
    keyData =
      typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  } catch (err: any) {
    throw new Error('فشل تحليل رمز JSON لحساب الخدمة Google: ' + err.message, { cause: err });
  }

  const clientEmail = keyData.client_email;
  const privateKey = keyData.private_key;
  if (!clientEmail || !privateKey) {
    throw new Error('رمز حساب الخدمة غير مكتمل. تأكد من وجود client_email و private_key');
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claim));
  const signInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = signer.sign({ key: privateKey });
  const encodedSignature = base64url(signature.toString('base64'), 'base64');

  const assertion = `${signInput}.${encodedSignature}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', assertion);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `فشل الحصول على Access Token من Google: ${response.statusText}. التفاصيل: ${errText}`,
    );
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

/**
 * تجديد Access Token لـ Google Drive عبر OAuth2 Refresh Token.
 * @param {string} clientId معرّف العميل
 * @param {string} clientSecret السر
 * @param {string} refreshToken رمز التحديث
 * @returns {Promise<string>}
 */
export async function getGoogleDriveAccessTokenViaOAuth(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
) {
  const params = new URLSearchParams();
  params.append('client_id', clientId?.trim());
  params.append('client_secret', clientSecret?.trim());
  params.append('refresh_token', refreshToken?.trim());
  params.append('grant_type', 'refresh_token');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `فشل تجديد Access Token لـ Google OAuth2: ${response.statusText}. التفاصيل: ${errText}`,
    );
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

/**
 * جلب إعدادات النسخ الاحتياطي السحابي من قاعدة البيانات.
 * @returns {Promise<Record<string, any>>}
 */
export const getCloudConfig = async () => {
  const result = await query(`SELECT value FROM settings WHERE key = 'cloud_backup'`);
  return (
    result.rows[0]?.value || {
      provider: 'none',
      gdrive_auth_type: 'service_account', // 'service_account' or 'oauth'
      gdrive_key: '',
      gdrive_folder_id: '',
      gdrive_client_id: '',
      gdrive_client_secret: '',
      gdrive_refresh_token: '',
      dropbox_token: '',
      dropbox_path: '/AlAgoouz-ERP-Backups',
      webhook_url: '',
    }
  );
};

/**
 * رفع نسخة احتياطية إلى مزود سحابي (Google Drive / Dropbox / Webhook).
 * @param {Record<string, any>} backupData بيانات النسخة
 * @param {string} fileName اسم الملف
 * @param {Record<string, any>} config إعدادات المزود
 * @returns {Promise<{ success: boolean, provider?: string, path?: string, message?: string }>}
 */
export const uploadBackupToCloud = async (
  backupData: Record<string, any>,
  fileName: string,
  config: Record<string, any>,
) => {
  const provider = config?.provider || 'none';
  if (provider === 'none') return { success: false, message: 'Cloud backup is disabled.' };

  const decryptedConfig = { ...config };
  if (decryptedConfig.gdrive_key) decryptedConfig.gdrive_key = decrypt(decryptedConfig.gdrive_key);
  if (decryptedConfig.dropbox_token)
    decryptedConfig.dropbox_token = decrypt(decryptedConfig.dropbox_token);
  if (decryptedConfig.gdrive_client_secret)
    decryptedConfig.gdrive_client_secret = decrypt(decryptedConfig.gdrive_client_secret);
  if (decryptedConfig.gdrive_refresh_token)
    decryptedConfig.gdrive_refresh_token = decrypt(decryptedConfig.gdrive_refresh_token);

  const content = JSON.stringify(backupData, null, 2);
  const blob = new Blob([content], { type: 'application/json' });

  if (provider === 'gdrive') {
    const authType = decryptedConfig.gdrive_auth_type || 'service_account';
    let accessToken;

    if (authType === 'service_account') {
      const serviceAccountJson = decryptedConfig.gdrive_key;
      if (!serviceAccountJson) {
        throw new AppError('مفتاح حساب الخدمة لـ Google Drive مفقود', 400);
      }
      accessToken = await getGoogleDriveAccessToken(serviceAccountJson);
    } else if (authType === 'oauth') {
      const clientId = decryptedConfig.gdrive_client_id;
      const clientSecret = decryptedConfig.gdrive_client_secret;
      const refreshToken = decryptedConfig.gdrive_refresh_token;

      if (!clientId || !clientSecret || !refreshToken) {
        throw new AppError(
          'بيانات اتصالات Google OAuth2 (Client ID, Client Secret, Refresh Token) غير مكتملة',
          400,
        );
      }
      accessToken = await getGoogleDriveAccessTokenViaOAuth(clientId, clientSecret, refreshToken);
    } else {
      throw new AppError('نوع المصادقة غير معروف لـ Google Drive', 400);
    }

    const folderId = decryptedConfig.gdrive_folder_id?.trim();
    const metadata: Record<string, any> = {
      name: fileName.endsWith('.json') ? fileName : `${fileName}.json`,
      mimeType: 'application/json',
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    const boundary = 'gdrive_upload_boundary';

    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(multipartBody).toString(),
        },
        body: multipartBody,
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      if (
        errText.includes('storageQuotaExceeded') ||
        errText.includes('Service Accounts do not have storage quota')
      ) {
        throw new AppError(
          'خطأ في المساحة: حساب الخدمة لـ Google Drive لا يملك مساحة تخزينية. لتفعيل النسخ الاحتياطي مجاناً، يرجى إنشاء "مساحة عمل مشتركة" (Shared Drive) في حسابك وإضافة بريد الخدمة (alagoouz@alagoouz.iam.gserviceaccount.com) كعضو فيها برتبة "مساهم"، أو تفعيل النسخ الاحتياطي عبر Dropbox أو Discord Webhook في الإعدادات.',
          403,
        );
      }
      throw new Error(
        `فشل رفع الملف إلى Google Drive: ${response.statusText}. التفاصيل: ${errText}`,
      );
    }

    const fileData = await response.json();
    return { success: true, provider: 'gdrive', path: `Google Drive File ID: ${fileData.id}` };
  }

  if (provider === 'dropbox') {
    const token = decryptedConfig.dropbox_token?.trim();
    if (!token) throw new AppError('Dropbox access token is missing', 400);

    const folderPath = (decryptedConfig.dropbox_path || '/AlAgoouz-ERP-Backups').trim();
    const cleanFolder = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
    const cleanFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    const targetPath = `${cleanFolder}/${cleanFileName}`.replace(/\/+/g, '/');

    const dropboxArg = JSON.stringify({
      path: targetPath,
      mode: 'add',
      autorename: true,
      mute: false,
      strict_conflict: false,
    });

    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': dropboxArg,
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Dropbox upload failed: ${response.statusText}. Details: ${errText}`);
    }

    const data = await response.json();
    return { success: true, provider: 'dropbox', path: data.path_display };
  }

  if (provider === 'webhook') {
    let urlObj;
    try {
      urlObj = new URL(decryptedConfig.webhook_url?.trim());
    } catch (e: any) {
      throw new AppError('Webhook URL is invalid', 400);
    }

    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      throw new AppError('Webhook URL must be HTTP or HTTPS', 400);
    }

    // SSRF Prevention: Block local/private IPs and localhost
    const hostname = urlObj.hostname;
    const isLocal =
      /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\])$/i.test(
        hostname,
      );
    if (isLocal) {
      throw new AppError('الروابط الداخلية للشبكة غير مسموح بها لأسباب أمنية', 403);
    }

    const url = urlObj.toString();

    const formData = new FormData();
    formData.append('file', blob, fileName);

    if (url.includes('discord.com/api/webhooks/')) {
      formData.append(
        'payload_json',
        JSON.stringify({
          content: `🔒 **نسخة احتياطية سحابية جديدة**\n📂 الملف: \`${fileName}\`\n📅 التاريخ: \`${new Date().toLocaleString('ar-EG')}\``,
        }),
      );
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Webhook upload failed: ${response.statusText}. Details: ${errText}`);
    }

    return { success: true, provider: 'webhook' };
  }

  throw new AppError('Unknown cloud provider', 400);
};

/**
 * اختبار الاتصال بمزود النسخ الاحتياطي السحابي بإنشاء ورفع نسخة تجريبية.
 * @param {Record<string, any>} config إعدادات المزود
 * @returns {Promise<{ success: boolean, provider?: string, path?: string }>}
 */
export const testCloudBackup = async (config: Record<string, any>) => {
  const backupRes = await backupService.createBackup();
  const now = new Date();
  const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
  const fileName = `test-cloud-backup-${timestamp}.json`;

  const fs = await import('fs/promises');
  let backupData;
  try {
    const content = await fs.readFile(backupRes.path, 'utf8');
    backupData = JSON.parse(content);
  } catch (e: any) {
    throw new AppError('فشل قراءة النسخة الاحتياطية لاختبارها', 500);
  }

  return await uploadBackupToCloud(backupData, fileName, config);
};
