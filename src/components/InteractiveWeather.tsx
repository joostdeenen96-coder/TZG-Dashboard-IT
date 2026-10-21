/**
 * Compat-export: InteractiveWeather is samengevoegd in WeatherCard.
 * Houdt bestaande imports werkend zonder dubbele implementatie.
 */
export { WeatherCard as InteractiveWeather, WeatherWidgetView, type WeatherWidgetSettings } from "./WeatherCard";
