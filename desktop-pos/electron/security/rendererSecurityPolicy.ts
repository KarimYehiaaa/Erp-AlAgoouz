export function isAllowedExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'agoouz.vercel.app' ||
      hostname === 'alagoouz.com' ||
      hostname.endsWith('.alagoouz.com') ||
      hostname === 'binalagoouz.com' ||
      hostname.endsWith('.binalagoouz.com')
    );
  } catch {
    return false;
  }
}
