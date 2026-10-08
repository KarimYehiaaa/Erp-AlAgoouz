# Supabase production root certificate

`prod-ca-2021.crt` is a public certificate, with no private key. Downloaded and
verified on 2026-10-01 from the official distribution:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Provenance: Supabase Studio's download URL template and SSL configuration component
at commit `d6c81b66c9999cb121dd8876f541313d484f157f`:

- https://github.com/supabase/supabase/blob/d6c81b66c9999cb121dd8876f541313d484f157f/apps/studio/hooks/custom-content/custom-content.json
- https://github.com/supabase/supabase/blob/d6c81b66c9999cb121dd8876f541313d484f157f/apps/studio/components/interfaces/Settings/Database/SSLConfiguration.tsx

File SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
Certificate SHA-256 fingerprint:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
Expires 2031-04-26. Both live pooler ports were verified using this CA in read-only
transactions; evidence is under `docs/audits/evidence`.

The application selects this certificate only for exact Supabase domain suffixes.
`DB_SSL_CA_FILE` explicitly overrides it. Renew from the official distribution
before expiry or when Supabase rotates its root; never copy an unverified peer
certificate into this trust bundle. Vercel's existing `backend/**` includeFiles
rule includes this file.
