export type DieselWeek = {
  itemId?: string;
  peildatum: string;
  /** Zichtbaar weeknummer uit SharePoint WebsiteWeek. */
  websiteWeek: number;
  dieselPrijs: number | null;
  /** Weergavewaarde: Math.floor(raw). */
  toeslagPercentage: number;
  toeslagPercentageRaw: number;
  toeslagPercentageDisplay: number;
  /** Informatief uit SharePoint; niet gebruikt voor Planning-selectie. */
  actief: boolean;
};

export type DieselSurcharge = DieselWeek & {
  /** Nieuwste peildatum eerst, daarna een-na-nieuwste. */
  weken: DieselWeek[];
  /** Laatste geldige records terwijl SharePoint tijdelijk niet bereikbaar is. */
  stale?: boolean;
};

export interface DieselSurchargeProvider {
  getCurrentData(): Promise<DieselSurcharge>;
}
