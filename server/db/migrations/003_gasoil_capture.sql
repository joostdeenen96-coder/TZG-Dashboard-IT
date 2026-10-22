-- Uitbreiding dagelijkse CBRB-capture + maandbron (automatic / manual-bootstrap).

ALTER TABLE gasoil_day_prices
  ADD COLUMN IF NOT EXISTS price_ex_vat_per_1000_liters numeric,
  ADD COLUMN IF NOT EXISTS observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_identifier text,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'valid';

ALTER TABLE gasoil_day_prices
  DROP CONSTRAINT IF EXISTS gasoil_day_prices_validation_status_check;

ALTER TABLE gasoil_day_prices
  ADD CONSTRAINT gasoil_day_prices_validation_status_check
  CHECK (validation_status IN ('valid', 'invalid'));

UPDATE gasoil_day_prices
SET price_ex_vat_per_1000_liters = ROUND(price_per_100_liters * 10, 2)
WHERE price_ex_vat_per_1000_liters IS NULL;

UPDATE gasoil_day_prices
SET observed_at = COALESCE(observed_at, retrieved_at)
WHERE observed_at IS NULL;

ALTER TABLE gasoil_month_observations
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS source_note text,
  ADD COLUMN IF NOT EXISTS applicable_year integer,
  ADD COLUMN IF NOT EXISTS applicable_month_num integer;

ALTER TABLE gasoil_month_observations
  DROP CONSTRAINT IF EXISTS gasoil_month_observations_source_type_check;

ALTER TABLE gasoil_month_observations
  ADD CONSTRAINT gasoil_month_observations_source_type_check
  CHECK (source_type IN ('automatic', 'manual-bootstrap'));

UPDATE gasoil_month_observations
SET
  applicable_year = COALESCE(
    applicable_year,
    CAST(split_part(applicable_month, '-', 1) AS integer)
  ),
  applicable_month_num = COALESCE(
    applicable_month_num,
    CAST(split_part(applicable_month, '-', 2) AS integer)
  )
WHERE applicable_year IS NULL OR applicable_month_num IS NULL;
