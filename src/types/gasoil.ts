export type GasOilCountry = "NL" | "BE";

export type GasOilAvailability = "ok" | "stale" | "unavailable";

export type GasOilSourceType = "automatic" | "manual-bootstrap";

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
  source: string;
  sourceLabel: string;
  retrievedAt: string | null;
  product: string | null;
  productLabel: string | null;
  rawPricePer100LitersCbrb: number | null;
  sourcePricePer100Liters: number | null;
  sourceType: GasOilSourceType | null;
  sourceNote: string | null;
  message: string | null;
};

export type GasOilCountryPayload = GasOilSurchargeResult & {
  current: GasOilSurchargeResult;
  next: GasOilSurchargeResult;
};

export type GasOilSurchargesPayload = {
  nl: GasOilCountryPayload;
  be: GasOilCountryPayload;
  fetchedAt: string;
};
