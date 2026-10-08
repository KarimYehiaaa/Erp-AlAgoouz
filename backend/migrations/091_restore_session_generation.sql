-- A restored token_version can repeat a historical value. A fresh random
-- generation prevents old JWTs from becoming valid after account restoration.
-- Deploy before the corresponding authentication code; clients must sign in again.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_generation UUID NOT NULL DEFAULT gen_random_uuid();
