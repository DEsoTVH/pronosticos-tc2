import type { SupabaseClient } from "@supabase/supabase-js";

const UA = "pronosticos-tc2/0.1 (club de pronosticos; berendicto@gmail.com)";
const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 50;

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

const norm = (s: string) => s.replace(/_/g, " ");
const stripHtml = (s: string | undefined) =>
  s?.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null;

type Claims = { error?: unknown; entities?: Record<string, { claims?: { P18?: { mainsnak: { datavalue?: { value: string } } }[] } }> };
type Pages = {
  query?: {
    pages: Record<
      string,
      {
        title: string;
        imageinfo?: {
          thumburl?: string;
          descriptionurl: string;
          extmetadata?: Record<string, { value: string }>;
        }[];
      }
    >;
  };
};

// Imágenes P18 por id de Wikidata. Un id inexistente hace fallar todo el lote: se reintenta uno a uno.
async function fetchClaims(qs: string[]) {
  const url = (ids: string[]) =>
    `https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=${ids.join("|")}`;
  const entities: NonNullable<Claims["entities"]> = {};
  const batch = await api<Claims>(url(qs));
  if (batch.entities && !batch.error) return batch.entities;
  for (const q of qs) {
    const one = await api<Claims>(url([q]));
    if (one.entities && !one.error) Object.assign(entities, one.entities);
  }
  return entities;
}

/**
 * Busca en Wikidata la imagen principal (P18) de los boxeadores con id Wikidata en su slug
 * y guarda miniatura, autor y licencia desde Commons. Marca photo_checked_at también cuando no hay foto.
 */
export async function syncPhotos(db: SupabaseClient, cap: number, log: (m: string) => void = console.log) {
  const cutoff = new Date(Date.now() - RECHECK_MS).toISOString();
  const { data } = await db
    .from("boxers")
    .select("id, boxerbook_slug")
    .like("boxerbook_slug", "%-q%")
    .eq("photo_manual", false)
    .or(`photo_checked_at.is.null,photo_checked_at.lt.${cutoff}`)
    .order("photo_checked_at", { ascending: true, nullsFirst: true })
    .limit(cap * 2);

  const todo = (data ?? [])
    .map((b) => ({ id: b.id as number, q: b.boxerbook_slug?.match(/-q(\d+)$/)?.[1] }))
    .filter((b): b is { id: number; q: string } => !!b.q)
    .slice(0, cap);

  let found = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const entities = await fetchClaims(chunk.map((b) => `Q${b.q}`));
    const fileOf = new Map(
      chunk.map((b) => [b.id, entities[`Q${b.q}`]?.claims?.P18?.[0]?.mainsnak.datavalue?.value]),
    );

    const files = [...new Set([...fileOf.values()].filter((f): f is string => !!f))];
    const info = new Map<string, NonNullable<Pages["query"]>["pages"][string]>();
    if (files.length) {
      const c = await api<Pages>(
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&titles=${encodeURIComponent(
          files.map((f) => `File:${f}`).join("|"),
        )}`,
      );
      for (const p of Object.values(c.query?.pages ?? {})) info.set(norm(p.title), p);
    }

    for (const b of chunk) {
      const file = fileOf.get(b.id);
      const page = file ? info.get(norm(`File:${file}`)) : undefined;
      const ii = page?.imageinfo?.[0];
      const meta = ii?.extmetadata;
      const update = ii?.thumburl
        ? {
            photo_url: ii.thumburl,
            photo_page_url: ii.descriptionurl,
            photo_author: stripHtml(meta?.Artist?.value),
            photo_license: stripHtml(meta?.LicenseShortName?.value),
            photo_license_url: meta?.LicenseUrl?.value ?? null,
          }
        : { photo_url: null, photo_page_url: null, photo_author: null, photo_license: null, photo_license_url: null };
      if (ii?.thumburl) found++;
      const { error } = await db
        .from("boxers")
        .update({ ...update, photo_checked_at: new Date().toISOString() })
        .eq("id", b.id);
      if (error) throw error;
    }
    log(`Fotos: ${Math.min(i + BATCH, todo.length)}/${todo.length} revisados, ${found} con foto`);
  }
  if (!todo.length) log("Fotos: nada pendiente.");
}
