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
  sex: "male" | "female" | null;
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

    // Consultar por id (evento, pelea, boxeador) exige llave gratuita; calendario, rankings y búsqueda no.
    const key = process.env.BOXERBOOK_API_KEY;
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(key && { Authorization: `Bearer ${key}` }),
      },
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 || res.status === 503) {
      await sleep(61_000); // Retry-After documentado: 60 s
      continue;
    }
    if (res.status === 401)
      throw new Error(`Boxerbook pide llave (401) en ${path}: falta BOXERBOOK_API_KEY o no es válida`);
    throw new Error(`Boxerbook ${res.status} en ${path}`);
  }
  throw new Error(`Boxerbook no respondió a tiempo en ${path}`);
}

export const getEvent = (id: number) => get<BbEvent>(`/events/${id}`);
export const getBout = (id: number) => get<BbBout>(`/bouts/${id}`);
export const getBoxer = (id: number) => get<BbBoxer>(`/boxers/${id}`);
export type BbRanking = {
  division: { code: string };
  publisher: string;
  list_date: string | null;
  items: {
    position: number;
    id: number;
    slug: string;
    name: string;
    champion_flag?: string | null;
  }[];
};

// Solo los rankings que publican los propios organismos y medios. El ranking "boxerbook" es creación de Boxerbook: no se usa.
export const PUBLISHERS = ["wbc", "wba", "ibf", "wbo", "ring", "tbrb"] as const;

export const getRanking = (division: string, publisher: string) =>
  get<BbRanking>(`/rankings/${division}?publisher=${publisher}`);

export type BbScheduleEvent = {
  id: number | null; // algunas carteleras no tienen id en Boxerbook
  date: string;
  start_utc?: string;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  bouts: BbBout[];
};

type ScheduleRes = {
  events: BbScheduleEvent[];
  truncated?: boolean;
  next_arguments?: { from_date?: string; skip?: number };
};

/** Próximas carteleras (la API pagina a 60 peleas: se siguen las páginas hasta un tope). */
export async function getSchedule(when: "weekend" | "30d", country?: string) {
  const merged = new Map<string, BbScheduleEvent>();
  let extra = "";

  for (let page = 0; page < 8; page++) {
    const r = await get<ScheduleRes>(
      `/schedule?when=${when}${country ? `&country=${country}` : ""}${extra}`,
    );
    for (const ev of r.events) {
      const key = ev.id ? `e${ev.id}` : `d${ev.date}|${ev.start_utc ?? ""}`;
      const prev = merged.get(key);
      if (!prev) merged.set(key, { ...ev, bouts: [...ev.bouts] });
      else
        for (const b of ev.bouts)
          if (!prev.bouts.some((x) => x.id === b.id)) prev.bouts.push(b);
    }
    const n = r.next_arguments;
    if (!r.truncated || !n) break;
    extra = `${n.from_date ? `&from_date=${n.from_date}` : ""}${n.skip ? `&skip=${n.skip}` : ""}`;
  }
  return [...merged.values()];
}

export type BbBoxerBout = {
  id: number;
  date: string;
  status: string; // scheduled | completed
  opponent: { id?: number; name: string; slug?: string };
  result: "W" | "L" | "D" | "NC" | null;
  method: string | null;
  round: number | null;
  time: string | null;
  scheduled_rounds: number | null;
  title_text: string | null;
  exhibition: boolean;
  record: string | null;
  opponent_record: string | null;
  url: string;
};

/** Historial completo de un boxeador (una sola página alcanza: el límite admite 500). */
export const getBoxerBouts = (id: number) =>
  get<{ total: number; bouts: BbBoxerBout[] }>(`/boxers/${id}/bouts?limit=500`);

export type BbBoxerHit = {
  id: number;
  slug: string;
  name: string;
  country: string | null;
  division: string | null;
  record: string | null;
};

/** Busca boxeadores por nombre en Boxerbook. */
export const searchBoxers = (q: string) =>
  get<{ results: BbBoxerHit[] }>(`/boxers/search?q=${encodeURIComponent(q)}`);
