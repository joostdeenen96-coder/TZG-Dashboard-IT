export type GasOilCountry = "NL" | "BE";

export type GasOilSourceId = "interrijn-cbrb-kbn" | "bestat-statbel";

export type GasOilPriceObservation = {
  country: GasOilCountry;
  referenceDate: string;
  applicableMonth: string;
  priceExVatPer1000Liters: number;
  source: GasOilSourceId;
  sourceLabel: string;
  retrievedAt: string;
  productLabel?: string;
  rawPriceInclPerLiter?: number;
  /** NL CBRB bronwaarde in €/100L (vóór ×10). */
  rawPricePer100LitersCbrb?: number;
  conversionNote?: string;
};

/** API/runtime status: ok = geldige maandobservatie, stale = cache bij bronstoring, unavailable = geen waarde. */
export type GasOilAvailability = "ok" | "stale" | "unavailable";

export type StaffelRange = {
  from: number;
  to: number;
};

export type GasOilSurchargeResult = {
  country: GasOilCountry;
  status: GasOilAvailability;
  applicableMonth: string | null;
  referenceDate: string | null;
  priceExVatPer1000Liters: number | null;
  surchargePerTon: number | null;
  staffelRange: StaffelRange | null;
  source: GasOilSourceId;
  sourceLabel: string;
  retrievedAt: string | null;
  /** API-veld uit specificatie; gelijk aan productLabel. */
  product: string | null;
  productLabel: string | null;
  /** NL: oorspronkelijke CBRB-waarde €/100L (alias sourcePricePer100Liters). */
  rawPricePer100LitersCbrb: number | null;
  /** NL API-contract: bronprijs €/100L CBRB. */
  sourcePricePer100Liters: number | null;
  message: string | null;
};

export type GasOilBeDiagnostics = {
  referenceDate: string | null;
  applicableMonth: string | null;
  productIdentifier: string;
  unit: string;
  vatStatus: "excl" | "incl-converted" | "cache" | "unavailable";
  vatDivisor: number | null;
  sourceRecord: {
    dayLabel: string;
    isoDate: string;
    product: string;
    priceIncl: number | null;
    priceExcl: number | null;
    unit: string;
    vatStatus: "excl" | "incl";
  } | null;
  cacheHit: boolean;
  historyEndpoint: string;
  dayEndpoint: string;
};

export type GasOilSurchargesPayload = {
  nl: GasOilSurchargeResult;
  be: GasOilSurchargeResult;
  fetchedAt: string;
  /** Alleen in development of bij GASOIL_DIAGNOSTICS=1. */
  diagnostics?: {
    be: GasOilBeDiagnostics;
  };
};

export type GasOilProviderHealth = {
  id: "interrijnCbrb" | "statbelGasOil";
  name: string;
  status: "healthy" | "stale" | "unavailable";
  detail: string;
  lastChecked: string;
};
