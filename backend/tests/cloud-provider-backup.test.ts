import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getGoogleDriveAccessToken,
  getGoogleDriveAccessTokenViaOAuth,
  uploadBackupToCloud,
} from '../src/services/cloudBackupService.ts';
import { decrypt, encrypt } from '../src/utils/crypto.ts';

const snapshot = { data: { customers: [{ full_name: 'private-fixture-customer' }] } };
const oauth = {
  provider: 'gdrive',
  gdrive_auth_type: 'oauth',
  gdrive_client_id: 'fixture-client',
  gdrive_client_secret: encrypt('fixture-secret'),
  gdrive_refresh_token: encrypt('fixture-refresh'),
  gdrive_folder_id: 'fixture-folder',
};
const dropbox = { provider: 'dropbox', dropbox_token: encrypt('fixture-dropbox-token') };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('cloud backup provider contracts', () => {
  it.each([{}, null, { access_token: '' }, { access_token: 123 }])(
    'rejects an invalid Google token response %j',
    async (data) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(data)));
      await expect(
        getGoogleDriveAccessTokenViaOAuth('fixture-client', 'fixture-secret', 'fixture-refresh'),
      ).rejects.toMatchObject({ statusCode: 502 });
    },
  );

  it('rejects blank OAuth credentials before contacting Google', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGoogleDriveAccessTokenViaOAuth(' ', 'secret', 'refresh')).rejects.toMatchObject(
      {
        statusCode: 400,
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects null service-account JSON with a safe configuration error', async () => {
    await expect(getGoogleDriveAccessToken('null')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('does not echo malformed service-account data or private-key errors', async () => {
    await expect(getGoogleDriveAccessToken('private-fixture-secret-json')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.not.stringContaining('private-fixture-secret-json'),
    });
    await expect(
      getGoogleDriveAccessToken({
        client_email: 'fixture@example.invalid',
        private_key: 'bad-key',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('uses a real RSA service-account assertion and rejects redirects with a deadline', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const fetchMock = vi.fn().mockResolvedValue(json({ access_token: 'fixture-token' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await getGoogleDriveAccessToken({
        client_email: 'fixture@example.invalid',
        private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      }),
    ).toBe('fixture-token');
    const options = fetchMock.mock.calls[0][1];
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const assertion = new URLSearchParams(options.body).get('assertion')!;
    expect(assertion.split('.')).toHaveLength(3);
    const [header, claims, signature] = assertion.split('.');
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
      iss: 'fixture@example.invalid',
      aud: 'https://oauth2.googleapis.com/token',
    });
    expect(
      crypto.verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${claims}`),
        publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it.each(['gdrive', 'dropbox'])(
    'never reports success without a %s upload receipt',
    async (provider) => {
      const fetchMock = vi.fn();
      if (provider === 'gdrive')
        fetchMock.mockResolvedValueOnce(json({ access_token: 'fixture-token' }));
      fetchMock.mockResolvedValueOnce(json({}));
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        uploadBackupToCloud(snapshot, 'fixture.json', provider === 'gdrive' ? oauth : dropbox),
      ).rejects.toMatchObject({ statusCode: 502 });
    },
  );

  it.each(['gdrive', 'dropbox'])(
    'does not expose a %s error response to the client',
    async (provider) => {
      const fetchMock = vi.fn();
      if (provider === 'gdrive')
        fetchMock.mockResolvedValueOnce(json({ access_token: 'fixture-token' }));
      fetchMock.mockResolvedValueOnce(
        json({ error: { message: 'private-fixture-provider-secret' } }, 403),
      );
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        uploadBackupToCloud(snapshot, 'fixture.json', provider === 'gdrive' ? oauth : dropbox),
      ).rejects.toMatchObject({
        message: expect.not.stringContaining('private-fixture-provider-secret'),
      });
    },
  );

  it('supports shared Drive uploads, encrypts data and shares one auth/upload deadline', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: 'fixture-token' }))
      .mockResolvedValueOnce(json({ id: 'fixture-id' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await uploadBackupToCloud(snapshot, 'fixture.json', oauth)).toMatchObject({
      success: true,
      path: 'Google Drive File ID: fixture-id',
    });
    const [url, options] = fetchMock.mock.calls[1];
    expect(new URL(url).searchParams.get('supportsAllDrives')).toBe('true');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal).toBe(fetchMock.mock.calls[0][1].signal);
    expect(options.body).not.toContain('private-fixture-customer');
    expect(options.body).toContain('fixture-folder');
  });

  it('keeps Dropbox encryption and validates the returned path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ path_display: '/fixture/fixture.json' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await uploadBackupToCloud(snapshot, 'fixture.json', dropbox)).toMatchObject({
      success: true,
      path: '/fixture/fixture.json',
    });
    const options = fetchMock.mock.calls[0][1];
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const envelope = JSON.parse(options.body);
    expect(envelope.encrypted).toBe(true);
    expect(JSON.parse(decrypt(envelope.payload))).toEqual(snapshot);
  });

  it('reports Google storage quota guidance without a hardcoded account', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ access_token: 'fixture-token' }))
        .mockResolvedValueOnce(
          json({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, 403),
        ),
    );
    await expect(uploadBackupToCloud(snapshot, 'fixture.json', oauth)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.not.stringContaining('alagoouz@alagoouz.iam.gserviceaccount.com'),
    });
  });
});
