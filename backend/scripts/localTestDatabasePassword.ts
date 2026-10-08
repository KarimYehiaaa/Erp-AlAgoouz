import { existsSync, readFileSync } from 'node:fs';

type PasswordOptions = {
  environment?: NodeJS.ProcessEnv;
  localPasswordFile: string;
};

export function resolveLocalTestDatabasePassword({
  environment = process.env,
  localPasswordFile,
}: PasswordOptions): string {
  const configuredPassword = environment.POSTGRES_PASSWORD || environment.DB_PASSWORD;
  if (configuredPassword) return configuredPassword;

  if (existsSync(localPasswordFile)) {
    const localPassword = readFileSync(localPasswordFile, 'utf8').trim();
    if (localPassword) return localPassword;
  }

  if (environment.CI) return 'postgres';

  throw new Error(
    'Local test database credentials are required. Set POSTGRES_PASSWORD or DB_PASSWORD, or create backend/.postgres.local.',
  );
}
