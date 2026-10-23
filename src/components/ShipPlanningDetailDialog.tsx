import { formatQuantity } from "../shipPlanning/formatQuantity";
import type { ShipPlanningEntry } from "../types/shipPlanning";
import { DashboardDetailModal } from "./DashboardDetailModal";

type ShipPlanningDetailDialogProps = {
  entry: ShipPlanningEntry;
  location: string;
  planningDate: string;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
};

const fields: { label: string; value: (entry: ShipPlanningEntry, location: string, planningDate: string) => string | null; wide?: boolean }[] = [
  { label: "Planningdatum", value: (_entry, _location, planningDate) => planningDate },
  { label: "Laadplaats", value: (_entry, location) => location },
  { label: "Tijd", value: (entry) => entry.time },
  { label: "Klant", value: (entry) => entry.customer },
  { label: "Losplaats", value: (entry) => entry.unloadingLocation },
  { label: "Conditie", value: (entry) => entry.condition },
  { label: "Product", value: (entry) => entry.product },
  { label: "Hoeveelheid", value: (entry) => formatQuantity(entry) },
  { label: "Schip", value: (entry) => entry.vessel },
  { label: "Order", value: (entry) => entry.orderNumber },
  { label: "Vervoerder", value: (entry) => entry.carrier },
  { label: "Telnr", value: (entry) => entry.phoneNumber },
  { label: "Losdatum", value: (entry) => entry.unloadingDate },
  { label: "Opmerking planning", value: (entry) => entry.planningRemark, wide: true },
];

export function ShipPlanningDetailDialog({ entry, location, planningDate, onClose, returnFocus }: ShipPlanningDetailDialogProps) {
  const visible = fields.flatMap((field) => {
    const value = field.value(entry, location, planningDate)?.trim();
    return value ? [{ ...field, value }] : [];
  });

  return (
    <DashboardDetailModal
      testId="ship-planning-detail"
      kicker="Schepenplanning"
      title={entry.vessel || "Rit"}
      subtitle={location}
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <dl className="dashboard-detail-fields">
        {visible.map((field) => (
          <div key={field.label} className={field.wide ? "dashboard-detail-field dashboard-detail-field-wide" : "dashboard-detail-field"}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </DashboardDetailModal>
  );
}
