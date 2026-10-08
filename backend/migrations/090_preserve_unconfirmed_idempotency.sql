-- Unconfirmed operations must survive cleanup: their business transaction may have committed.
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_records()
RETURNS void AS $$
BEGIN
    DELETE FROM idempotency_records WHERE status = 'COMPLETED' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp;
