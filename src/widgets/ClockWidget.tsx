import { useAmsterdamNow } from "../hooks/useAmsterdamNow";
import { formatAmsterdamStamp } from "../lib/format";

export function ClockWidget() {
  const now = useAmsterdamNow();
  const stamp = formatAmsterdamStamp(now);
  const [date, time] = stamp.split(" · ");
  return (
    <div className="tv-card flex h-full min-h-[100px] items-center justify-center px-5 py-4 text-center">
      <div>
        <p className="text-[22px] text-mist">{date}</p>
        <p className="font-display text-[56px] font-semibold tabular-nums tracking-[-0.01em] text-paper">{time}</p>
      </div>
    </div>
  );
}
