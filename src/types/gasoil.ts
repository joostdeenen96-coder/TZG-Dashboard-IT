export type GasOilCountry = "NL" | "BE";

export type GasOilAvailability = "ready" | "stale" | "unavailable";

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
  productLabel: string | null;
  message: string | null;
};

export type GasOilSurchargesPayload = {
  nl: GasOilSurchargeResult;
  be: GasOilSurchargeResult;
  fetchedAt: string;
};
