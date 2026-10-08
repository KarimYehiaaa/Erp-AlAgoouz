import crypto from 'crypto';
import { query } from '../database/pool.ts';
import * as backupService from './backupService.ts';
import { AppError } from '../types/errors.ts';
import { decrypt, encrypt } from '../utils/crypto.ts';
import { createPublicWebhookDispatcher } from '../utils/urlValidator.ts';
import {
  CLOUD_BACKUP_TIMEOUT_MS,
  requestCloudJson,
  requireProviderString,
} from '../utils/cloudProviderRequest.ts';

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
export async function getGoogleDriveAccessToken(
  serviceAccountJson: string | Record<string, any>,
  signal: AbortSignal = AbortSignal.timeout(CLOUD_BACKUP_TIMEOUT_MS),
) {
  /** @type {any} */
  let keyData;
  try {
    keyData =
      typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  } catch {
    throw new AppError('بيانات JSON لحساب خدمة Google غير صالحة', 400);
  }

  const clientEmail = keyData?.client_email;
  const privateKey = keyData?.private_key;
  if (
    !keyData ||
    Array.isArray(keyData) ||
    typeof clientEmail !== 'string' ||
    !clientEmail.trim() ||
    typeof privateKey !== 'string' ||
    !privateKey.trim()
  ) {
    throw new AppError('رمز حساب الخدمة غير مكتمل. تأكد من وجود client_email و private_key', 400);
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail.trim(),
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claim));
  const signInput = `${encodedHeader}.${encodedClaim}`;

  let signature: Buffer;
  try {
    const key = crypto.createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('Expected RSA key');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signInput);
    signature = signer.sign(key);
  } catch {
    throw new AppError('المفتاح الخاص لحساب خدمة Google غير صالح؛ تحقق من إعداد الحساب', 400);
  }
  const encodedSignature = base64url(signature.toString('base64'), 'base64');

  const assertion = `${signInput}.${encodedSignature}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', assertion);

  const tokenData = await requestCloudJson(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    },
    'فشل اعتماد حساب خدمة Google',
    signal,
  );
  return requireProviderString(tokenData, 'access_token');
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
  signal: AbortSignal = AbortSignal.timeout(CLOUD_BACKUP_TIMEOUT_MS),
) {
  if ([clientId, clientSecret, refreshToken].some((v) => typeof v !== 'string' || !v.trim())) {
    throw new AppError('بيانات اتصالات Google OAuth2 غير مكتملة', 400);
  }
  const params = new URLSearchParams();
  params.append('client_id', clientId?.trim());
  params.append('client_secret', clientSecret?.trim());
  params.append('refresh_token', refreshToken?.trim());
  params.append('grant_type', 'refresh_token');

  const tokenData = await requestCloudJson(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    },
    'فشل تجديد اعتماد Google OAuth2',
    signal,
  );
  return requireProviderString(tokenData, 'access_token');
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
  // One budget covers token acquisition and upload, including response bodies.
  const signal = AbortSignal.timeout(CLOUD_BACKUP_TIMEOUT_MS);

  const decryptedConfig = { ...config };
  if (decryptedConfig.gdrive_key) decryptedConfig.gdrive_key = decrypt(decryptedConfig.gdrive_key);
  if (decryptedConfig.dropbox_token)
    decryptedConfig.dropbox_token = decrypt(decryptedConfig.dropbox_token);
  if (decryptedConfig.gdrive_client_secret)
    decryptedConfig.gdrive_client_secret = decrypt(decryptedConfig.gdrive_client_secret);
  if (decryptedConfig.gdrive_refresh_token)
    decryptedConfig.gdrive_refresh_token = decrypt(decryptedConfig.gdrive_refresh_token);

  const encryptedBackup =
    backupData.encrypted === true && typeof backupData.payload === 'string'
      ? backupData
      : { encrypted: true, payload: encrypt(JSON.stringify(backupData)) };
  const content = JSON.stringify(encryptedBackup);
  const blob = new Blob([content], { type: 'application/json' });

  if (provider === 'gdrive') {
    const authType = decryptedConfig.gdrive_auth_type || 'service_account';
    let accessToken;

    if (authType === 'service_account') {
      const serviceAccountJson = decryptedConfig.gdrive_key;
      if (!serviceAccountJson) {
        throw new AppError('مفتاح حساب الخدمة لـ Google Drive مفقود', 400);
      }
      accessToken = await getGoogleDriveAccessToken(serviceAccountJson, signal);
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
      accessToken = await getGoogleDriveAccessTokenViaOAuth(
        clientId,
        clientSecret,
        refreshToken,
        signal,
      );
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

    const fileData = await requestCloudJson(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(multipartBody).toString(),
        },
        body: multipartBody,
      },
      'فشل رفع النسخة إلى Google Drive',
      signal,
      true,
    );
    const id = requireProviderString(fileData, 'id');
    return { success: true, provider: 'gdrive', path: `Google Drive File ID: ${id}` };
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

    const data = await requestCloudJson(
      'https://content.dropboxapi.com/2/files/upload',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Dropbox-API-Arg': dropboxArg,
          'Content-Type': 'application/octet-stream',
        },
        body: content,
      },
      'فشل رفع النسخة إلى Dropbox',
      signal,
    );
    const storedPath = requireProviderString(data, 'path_display');
    if (!storedPath.startsWith('/')) throw new AppError('مسار نسخة Dropbox غير صالح', 502);
    return { success: true, provider: 'dropbox', path: storedPath };
  }

  if (provider === 'webhook') {
    const webhookUrl = decryptedConfig.webhook_url?.trim();
    const dispatcher = await createPublicWebhookDispatcher(webhookUrl, signal);
    let response: Response | undefined;
    try {
      const urlObj = new URL(webhookUrl);
      const url = urlObj.toString();
      const formData = new FormData();
      formData.append('file', blob, fileName);

      if (
        urlObj.hostname.toLowerCase() === 'discord.com' &&
        urlObj.pathname.startsWith('/api/webhooks/')
      ) {
        formData.append(
          'payload_json',
          JSON.stringify({
            content: ` **نسخة احتياطية سحابية جديدة**\n الملف: \`${fileName}\`\n التاريخ: \`${new Date().toLocaleString('ar-EG')}\``,
          }),
        );
      }

      response = await fetch(url, {
        method: 'POST',
        body: formData,
        redirect: 'error',
        signal,
        dispatcher,
      } as Parameters<typeof fetch>[1] & { dispatcher: typeof dispatcher });

      if (!response.ok) {
        throw new AppError(`Webhook upload failed (HTTP ${response.status})`, 400);
      }

      return { success: true, provider: 'webhook' };
    } finally {
      if (response?.body) await response.body.cancel().catch(() => undefined);
      await dispatcher.close();
    }
  }

  throw new AppError('Unknown cloud provider', 400);
};

/**
 * اختبار الاتصال بمزود النسخ الاحتياطي السحابي بإنشاء ورفع نسخة تجريبية.
 * @param {Record<string, any>} config إعدادات المزود
 * @returns {Promise<{ success: boolean, provider?: string, path?: string }>}
 */
export const testCloudBackup = async (config: Record<string, any>) => {
  const backupRes = await backupService.buildBackupDownload();
  const now = new Date();
  const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
  const fileName = `test-cloud-backup-${timestamp}.json`;

  let backupData;
  try {
    backupData = JSON.parse(backupRes.content);
  } catch {
    throw new AppError('فشل قراءة النسخة الاحتياطية لاختبارها', 500);
  }

  return await uploadBackupToCloud(backupData, fileName, config);
};
