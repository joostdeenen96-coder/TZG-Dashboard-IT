import { useState, type FormEvent } from "react";
import {
  commitGasOilBootstrap,
  previewGasOilBootstrap,
  runGasOilCaptureNow,
  type GasOilBootstrapPreview,
} from "../services/adminService";

const fieldClass =
  "mt-1 w-full rounded-lg border border-veil/12 bg-ink px-3 py-2 text-[16px] text-paper outline-none focus:border-gold";

const money = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AdminGasOilBootstrapSection({ authenticated }: { authenticated: boolean }) {
  const [referenceDate, setReferenceDate] = useState("15-10-2026");
  const [pricePer100Liters, setPricePer100Liters] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [preview, setPreview] = useState<GasOilBootstrapPreview | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "saved">("idle");
  const [message, setMessage] = useState("");

  if (!authenticated) return null;

  async function onPreview(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    setPreview(null);
    try {
      const next = await previewGasOilBootstrap({
        country: "NL",
        referenceDate,
        pricePer100Liters,
        sourceNote,
      });
      setPreview(next);
      setStatus("idle");
      if (next.alreadyExists) {
        setMessage(`Er bestaat al een maandobservatie voor ${next.applicableMonthLabel}. Opslaan is geblokkeerd.`);
        setStatus("error");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Preview mislukt.");
    }
  }

  async function onCommit() {
    if (!preview || preview.alreadyExists) return;
    setStatus("loading");
    setMessage("");
    try {
      await commitGasOilBootstrap({
        country: "NL",
        referenceDate,
        pricePer100Liters,
        sourceNote,
      });
      setStatus("saved");
      setMessage(`Maandobservatie ${preview.applicableMonthLabel} opgeslagen (€ ${preview.surchargePerTon.toFixed(2)} / ton).`);
      setPreview(null);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt.");
    }
  }

  async function onCaptureNow() {
    setStatus("loading");
    setMessage("");
    try {
      const result = (await runGasOilCaptureNow()) as { status?: string; reason?: string; observationDate?: string };
      setStatus(result.status === "failed" ? "error" : "saved");
      setMessage(
        result.status === "success"
          ? `Capture succesvol (${result.observationDate}).`
          : result.status === "skipped"
            ? `Capture overgeslagen: ${result.reason ?? ""}`
            : `Capture mislukt: ${result.reason ?? ""}`,
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Capture mislukt.");
    }
  }

  return (
    <section className="tv-card mt-6 px-5 py-4 md:col-span-2">
      <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">
        Gasolie NL — historische peildatum
      </h2>
      <p className="mt-2 text-[15px] text-mist">
        Alleen voor ontbrekende peildatums (15e). Voer de officiële CBRB/KBN-prijs €/100L in. Toeslag wordt altijd
        berekend (×10 + staffel) — nooit handmatig.
      </p>

      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void onPreview(event)}>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Land
          <input className={fieldClass} value="Nederland" disabled readOnly />
        </label>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Peildatum (15e)
          <input
            className={fieldClass}
            value={referenceDate}
            onChange={(event) => {
              setReferenceDate(event.target.value);
              setPreview(null);
            }}
            placeholder="15-10-2026"
          />
        </label>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          CBRB/KBN prijs €/100L
          <input
            className={fieldClass}
            value={pricePer100Liters}
            onChange={(event) => {
              setPricePer100Liters(event.target.value);
              setPreview(null);
            }}
            placeholder="bijv. 164,26"
            inputMode="decimal"
          />
        </label>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Bronnotitie
          <input
            className={fieldClass}
            value={sourceNote}
            onChange={(event) => {
              setSourceNote(event.target.value);
              setPreview(null);
            }}
            placeholder="bijv. Interrijn archief / Teunesen bevestiging"
          />
        </label>
        <div className="flex flex-wrap gap-3 md:col-span-2">
          <button
            type="submit"
            className="rounded-full border border-slate/50 px-5 py-2 text-[16px] font-bold tracking-[0.02em] text-paper uppercase"
            disabled={status === "loading"}
          >
            Preview berekening
          </button>
          <button
            type="button"
            className="rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[16px] font-semibold tracking-[0.02em] text-gold uppercase disabled:opacity-40"
            disabled={status === "loading" || !preview || preview.alreadyExists}
            onClick={() => void onCommit()}
          >
            Opslaan maandobservatie
          </button>
          <button
            type="button"
            className="rounded-full border border-slate/50 px-5 py-2 text-[16px] font-bold tracking-[0.02em] text-paper uppercase"
            disabled={status === "loading"}
            onClick={() => void onCaptureNow()}
          >
            Capture nu (Interrijn)
          </button>
        </div>
      </form>

      {preview ? (
        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-veil/15 bg-ink/40 p-4 text-[16px]">
          <div>
            <dt className="text-mist">CBRB</dt>
            <dd className="font-semibold">{money.format(preview.sourcePricePer100Liters)} / 100L</dd>
          </div>
          <div>
            <dt className="text-mist">Prijs staffel</dt>
            <dd className="font-semibold">{money.format(preview.priceExVatPer1000Liters)} / 1000L</dd>
          </div>
          <div>
            <dt className="text-mist">Staffel</dt>
            <dd className="font-semibold">
              {preview.staffelRange
                ? `${money.format(preview.staffelRange.from)} - ${money.format(preview.staffelRange.to)}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-mist">Toeslag</dt>
            <dd className="font-display text-[28px] font-semibold text-gold">
              {money.format(preview.surchargePerTon)} / ton
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-mist">Geldige toepassingsmaand</dt>
            <dd className="font-semibold capitalize">{preview.applicableMonthLabel}</dd>
          </div>
        </dl>
      ) : null}

      {message ? (
        <p className={`mt-4 text-[16px] ${status === "error" ? "text-gold" : "text-paper"}`}>{message}</p>
      ) : null}
    </section>
  );
}
