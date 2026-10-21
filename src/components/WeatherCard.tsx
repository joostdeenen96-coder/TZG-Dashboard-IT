import { InteractiveWeather } from "./InteractiveWeather";

/** Legacy/full weather card — gebruikt dezelfde live feed en popup als de headerwidget. */
export function WeatherCard() {
  return (
    <div className="h-full min-h-[200px]">
      <InteractiveWeather variant="card" />
    </div>
  );
}
