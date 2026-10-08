const MAX_ACCESS_TOKEN_SECONDS = 12 * 60 * 60;

const UNIT_SECONDS: Record<string, number> = {
  ms: 0.001,
  msec: 0.001,
  msecs: 0.001,
  millisecond: 0.001,
  milliseconds: 0.001,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 60 * 60,
  hr: 60 * 60,
  hrs: 60 * 60,
  hour: 60 * 60,
  hours: 60 * 60,
  d: 24 * 60 * 60,
  day: 24 * 60 * 60,
  days: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
  weeks: 7 * 24 * 60 * 60,
  y: 365 * 24 * 60 * 60,
  year: 365 * 24 * 60 * 60,
  years: 365 * 24 * 60 * 60,
};

/** Keep configurable access JWTs short-lived and reject ambiguous jsonwebtoken string values. */
export function validateAccessTokenExpiration(value: string): string {
  const normalized = value.trim().toLowerCase();
  const match =
    /^(\d+(?:\.\d+)?)\s*(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|y)$/.exec(
      normalized,
    );
  const amount = match ? Number(match[1]) : Number.NaN;
  const unitSeconds = match ? UNIT_SECONDS[match[2]] : undefined;
  const durationSeconds = unitSeconds === undefined ? Number.NaN : amount * unitSeconds;

  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 1 ||
    durationSeconds > MAX_ACCESS_TOKEN_SECONDS
  ) {
    throw new Error(
      'JWT_EXPIRES_IN must be a duration between 1 second and 12 hours (for example, 2h).',
    );
  }

  return normalized;
}
