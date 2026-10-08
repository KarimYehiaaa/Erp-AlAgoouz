/** Fail at fixture setup instead of issuing an accidentally unauthenticated request. */
export function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing`);
  return value;
}
