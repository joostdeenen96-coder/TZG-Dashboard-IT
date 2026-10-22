-- Persistente gasolie maandobservaties (NL/BE). Browsercache is geen primaire opslag.
CREATE TABLE IF NOT EXISTS gasoil_month_observations (
  country text NOT NULL CHECK (country IN ('NL', 'BE')),
  applicable_month text NOT NULL,
  reference_date date NOT NULL,
  raw_source_value numeric NOT NULL CHECK (raw_source_value > 0),
  price_ex_vat_per_1000_liters numeric NOT NULL CHECK (price_ex_vat_per_1000_liters > 0),
  surcharge_per_ton numeric,
  product_identifier text NOT NULL,
  source text NOT NULL,
  source_label text NOT NULL,
  vat_status text NOT NULL CHECK (vat_status IN ('excl', 'incl-converted')),
  conversion_note text,
  retrieved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country, applicable_month)
);

CREATE TABLE IF NOT EXISTS gasoil_day_prices (
  country text NOT NULL CHECK (country IN ('NL', 'BE')),
  published_date date NOT NULL,
  price_per_100_liters numeric NOT NULL CHECK (price_per_100_liters > 0),
  source text NOT NULL,
  published_at_label text,
  retrieved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country, published_date, source)
);

CREATE INDEX IF NOT EXISTS gasoil_month_observations_reference_date_idx
  ON gasoil_month_observations (country, reference_date);
