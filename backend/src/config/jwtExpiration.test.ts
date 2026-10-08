import { describe, expect, it } from 'vitest';
import { validateAccessTokenExpiration } from './jwtExpiration.ts';

describe('validateAccessTokenExpiration', () => {
  it.each(['2h', '8h', '12 hours', '720 minutes', '43200 seconds'])(
    'accepts %s within the access-token limit',
    (value) => {
      expect(validateAccessTokenExpiration(value)).toBe(value.toLowerCase());
    },
  );

  it.each(['13h', '1d', '0s', '-1h', '900', 'soon', '500ms'])(
    'rejects unsafe or ambiguous value %s',
    (value) => {
      expect(() => validateAccessTokenExpiration(value)).toThrow(/1 second and 12 hours/);
    },
  );
});
