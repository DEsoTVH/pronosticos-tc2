import type { SupabaseClient } from "@supabase/supabase-js";

const UA = "Mozilla/5.0 (compatible; pronosticos-tc2; berendicto@gmail.com)";
const KEEP_DAYS = 30;

type Feed = { name: string; lang: "es" | "en"; url: string; limit: number };

// Solo se guarda titular, fuente, fecha y enlace: nunca el texto ni las imágenes de las notas.
const FEEDS: Feed[] = [
  {
    name: "Google Noticias",
    lang: "es",
    url: "https://news.google.com/rss/search?q=boxeo&hl=es-419&gl=CL&ceid=CL:es-419",
    limit: 40,
  },
  {
    name: "Google Noticias",
    lang: "es",
    url: "https://news.google.com/rss/search?q=boxeo+Chile&hl=es-419&gl=CL&ceid=CL:es-419",
    limit: 30,
  },
  { name: "ESPN", lang: "en", url: "https://www.espn.com/espn/rss/boxing/news", limit: 20 },
  { name: "Boxing News 24", lang: "en", url: "https://www.boxingnews24.com/feed/", limit: 20 },
];

// Redes sociales que Google Noticias a veces mezcla: no son noticias.
const BLOCKED_SOURCES = /^(facebook|instagram|tiktok|youtube|x|twitter|reddit)$/i;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : null;
}

async function readFeed(feed: Feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const xml = await res.text();

  const out: { url: string; title: string; source: string; lang: string; published_at: string }[] = [];
  for (const block of xml.split(/<item[ >]/).slice(1)) {
    const url = tag(block, "link");
    let title = tag(block, "title");
    const date = new Date(tag(block, "pubDate") ?? "");
    if (!url || !title || isNaN(date.getTime()) || !/^https?:\/\//.test(url)) continue;

    // Google Noticias pone el medio aparte y también al final del titular ("… - RedGol").
    let source = feed.name;
    if (feed.name === "Google Noticias") {
      const src = tag(block, "source");
      if (src) {
        source = src;
        title = title.replace(new RegExp(`\\s+-\\s+${src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
      }
    }
    if (BLOCKED_SOURCES.test(source)) continue;
    out.push({ url, title, source, lang: feed.lang, published_at: date.toISOString() });
  }
  return out
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, feed.limit);
}

/** Guarda en la tabla news los titulares de los feeds y borra los de más de 30 días. */
export async function syncNews(db: SupabaseClient, log: (m: string) => void = console.log) {
  let total = 0;
  for (const feed of FEEDS) {
    try {
      const rows = [...new Map((await readFeed(feed)).map((r) => [r.url, r])).values()];
      if (rows.length) {
        const { error } = await db.from("news").upsert(rows, { onConflict: "url" });
        if (error) throw error;
      }
      total += rows.length;
      log(`Noticias: ${feed.name} → ${rows.length}`);
    } catch (e) {
      // Un feed caído no debe frenar a los demás.
      log(`Noticias: ${feed.name} falló (${e instanceof Error ? e.message : JSON.stringify(e)})`);
    }
  }
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { error } = await db.from("news").delete().lt("published_at", cutoff);
  if (error) throw error;
  log(`Noticias: ${total} titulares guardados`);
}
