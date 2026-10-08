import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';

type DatabaseEndpoint = { connectionString?: string | null; host?: string | null };
export type DatabaseSsl = false | { rejectUnauthorized: true; ca?: string };

/** Resolve strict TLS before pg can overwrite it using URI query parameters. */
export const resolveDatabaseSsl = (
  connection: DatabaseEndpoint,
  env: Record<string, string | undefined>,
  certificateBaseDirectory: string,
): DatabaseSsl => {
  let host = connection.host || 'localhost';
  if (connection.connectionString) {
    const url = new URL(connection.connectionString);
    host = url.hostname;
    const uriSslKeys = [
      'ssl',
      'sslmode',
      'sslcert',
      'sslkey',
      'sslrootcert',
      'sslnegotiation',
      'uselibpqcompat',
    ];
    const present = uriSslKeys.filter((key) => url.searchParams.has(key));
    if (present.length > 0) {
      // Do not strip client cert/key paths silently or let sslmode=no-verify
      // disable verification. Operators must resolve this configuration first.
      throw new Error(
        `[Config] DATABASE_URL contains TLS overrides (${present.join(', ')}). ` +
          'Configure DB_SSL and DB_SSL_CA_FILE outside the URI; preserve and review any client certificate/key configuration.',
      );
    }
  }
  const isLoopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host.toLowerCase());
  const isCloud = connection.connectionString
    ? !isLoopback
    : /(?:^|\.)supabase\.(?:com|co)$|(?:^|\.)neon\.tech$/i.test(host);
  const caFile = env.DB_SSL_CA_FILE?.trim();
  const enabled = env.DB_SSL === 'true' || isCloud || Boolean(caFile);
  if (!enabled) return false;
  if (env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    throw new Error(
      '[Security Error] Database TLS certificate verification cannot be disabled. ' +
        'Remove DB_SSL_REJECT_UNAUTHORIZED=false and configure a trusted DB_SSL_CA_FILE when required.',
    );
  }
  const isSupabase = /(?:^|\.)supabase\.(?:com|co)$/i.test(host);
  if (!caFile && !isSupabase) return { rejectUnauthorized: true };
  // Public CA downloaded from Supabase's official HTTPS distribution. Only
  // actual Supabase domains select it; explicit operator certificates win.
  const certificatePath = caFile
    ? path.resolve(certificateBaseDirectory, caFile)
    : fileURLToPath(new URL('../../certs/prod-ca-2021.crt', import.meta.url));

  let certificate: string;
  try {
    certificate = fs.readFileSync(certificatePath, 'utf8');
  } catch {
    throw new Error('[Config] DB_SSL_CA_FILE could not be read.');
  }
  const certificates = certificate.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  );
  if (!certificates?.length || /-----BEGIN [^-]*PRIVATE KEY-----/.test(certificate)) {
    throw new Error(
      '[Config] DB_SSL_CA_FILE must contain trusted PEM certificates without private keys.',
    );
  }
  try {
    for (const pem of certificates) new X509Certificate(pem);
  } catch {
    throw new Error('[Config] DB_SSL_CA_FILE contains an invalid PEM certificate.');
  }
  return { rejectUnauthorized: true, ca: certificate };
};
