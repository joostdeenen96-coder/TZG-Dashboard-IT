import type { ProjectSlide, QueryState } from "../types";

const slides: ProjectSlide[] = [
  {
    id: "zandwinning",
    title: "Zandwinning Milsbeek",
    location: "Milsbeek",
    url: "/projects/zandwinning.jpg",
    gradient: "from-[#4a3418] via-[#1c2818] to-[#0c1410]",
    objectPosition: "center center",
  },
  {
    id: "grondwerk",
    title: "Grondwerk bedrijventerrein",
    location: "Heijen",
    url: "/projects/grondwerk.jpg",
    gradient: "from-[#24502c] via-[#14301c] to-[#0b140f]",
    objectPosition: "center 42%",
  },
  {
    id: "infra",
    title: "Onderhoud N271",
    location: "Gennep — Boxmeer",
    url: "/projects/infra.jpg",
    gradient: "from-[#1e4a30] via-[#143024] to-[#0a120e]",
    objectPosition: "center 70%",
  },
  {
    id: "binnenvaart",
    title: "Grindtransport Maas",
    location: "Loswal Gennep",
    url: "/projects/binnenvaart.jpg",
    gradient: "from-[#1a3c52] via-[#143028] to-[#0a120e]",
    objectPosition: "center 38%",
  },
  {
    id: "oever",
    title: "Oeverwerk aan de kade",
    location: "Gennep",
    url: "/projects/oeverwerk.jpg",
    gradient: "from-[#2a3c4a] via-[#1a2c22] to-[#0c1210]",
    objectPosition: "center 55%",
  },
];

const slideIntervalMs = 8000;

function readResult<T>(load: () => T, isEmpty: (value: T) => boolean, emptyMessage: string): QueryState<T> {
  try {
    const data = load();
    if (isEmpty(data)) return { status: "empty", refreshing: false, fetchedAt: null };
    return { status: "ready", data, refreshing: false, fetchedAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : emptyMessage;
    return { status: "error", message, refreshing: false, fetchedAt: null };
  }
}

export function readSlides(): QueryState<ProjectSlide[]> {
  return readResult(getSlides, (items) => items.length === 0, "Projectfoto's niet beschikbaar.");
}

export function getSlides() {
  return slides;
}

export function getSlideIntervalMs() {
  return slideIntervalMs;
}
