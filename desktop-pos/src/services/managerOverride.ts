export interface ManagerOverrideTarget {
  method: 'POST' | 'PUT';
  path: string;
}

export const MANAGER_OVERRIDE_HEADER_NAME = 'X-Manager-Override';

const TOKEN_TTL_MS = 10 * 60 * 1000;
let activeGrant: { token: string; target: string; expiresAt: number } | null = null;

const requestKey = (method: string, path: string) =>
  `${method.toUpperCase()} ${path.split('?')[0]}`;

export function setManagerOverrideToken(token: string, target: ManagerOverrideTarget): void {
  activeGrant = {
    token,
    target: requestKey(target.method, target.path),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
}

export function consumeManagerOverrideToken(method: string, path: string): string | null {
  if (!activeGrant) return null;
  if (activeGrant.expiresAt <= Date.now()) {
    activeGrant = null;
    return null;
  }
  if (activeGrant.target !== requestKey(method, path)) return null;

  const token = activeGrant.token;
  activeGrant = null;
  return token;
}

export function clearManagerOverrideToken(): void {
  activeGrant = null;
}
