export type DieselWeek = {
  itemId?: string;
  peildatum: string;
  isoWeek?: number;
  dieselPrijs: number;
  toeslagPercentage: number;
  /** Informatief uit SharePoint; niet gebruikt voor Planning-selectie. */
  actief: boolean;
};

export type DieselSurcharge = DieselWeek & {
  /** Nieuwste peildatum eerst, daarna een-na-nieuwste. */
  weken: DieselWeek[];
};

export interface DieselSurchargeProvider {
  getCurrentData(): Promise<DieselSurcharge>;
}
