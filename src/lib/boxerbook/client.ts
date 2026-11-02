// Cliente mínimo de la API pública de Boxerbook (https://boxerbook.com/v1, sin clave, ODbL).
// Límite: 60 req/min por IP → espaciamos las llamadas. Términos: identificar al cliente
// con User-Agent y no recorrer el catálogo completo.

const BASE = "https://boxerbook.com/v1";
const USER_AGENT = "pronosticos-tc2/0.1 (club de pronosticos; berendicto@gmail.com)";
const MIN_GAP_MS = 1200;

export type BbSide = {
  id?: number;
  name: string;
  slug?: string;
  record: string | null;
};

export type BbBout = {
  id: number;
  date: string;
  start_utc?: string;
  status: string; // scheduled | completed | ...
  a: BbSide;
  b: BbSide;
  display: ("a" | "b")[];
  winner?: "a" | "b" | "draw" | "nc" | null;
  method?: string | null;
  round?: number | null;
  time?: string | null;
  scheduled_rounds?: number | null;
  title_text?: string | null;
  division?: string | null;
  forecast?: { p_a: number } | null;
};

export type BbEvent = {
  id: number;
  date: string;
  status: string;
  venue: string | null;
  city: string | null;
  country: string | null;
  bouts: BbBout[];
};

export type BbBoxer = {
  id: number;
  slug: string;
  name: string;
  nickname: string | null;
  country: string | null;
  division: string | null;
  record: { w: number; l: number; d: number; ko: number } | null;
  stance: string | null;
  height_cm: number | null;
  reach_cm: number | null;
};

let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();

    const res = await fetch(`${BASE}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 || res.status === 503) {
      await sleep(61_000); // Retry-After documentado: 60 s
      continue;
    }
    throw new Error(`Boxerbook ${res.status} en ${path}`);
  }
  throw new Error(`Boxerbook no respondió a tiempo en ${path}`);
}

export const getEvent = (id: number) => get<BbEvent>(`/events/${id}`);
export const getBout = (id: number) => get<BbBout>(`/bouts/${id}`);
export const getBoxer = (id: number) => get<BbBoxer>(`/boxers/${id}`);
export const getSchedule = (when: "weekend" | "30d", country?: string) =>
  get<{ events: BbEvent[] }>(
    `/schedule?when=${when}${country ? `&country=${country}` : ""}`,
  );
