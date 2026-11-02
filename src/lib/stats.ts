import { createClient } from "@/lib/supabase/server";
import { DIVISIONS, WOMEN_DIVISIONS } from "@/lib/divisions";

export const PUBLISHER_LABELS: Record<string, string> = {
  boxerbook: "Boxerbook",
  wbc: "WBC",
  wba: "WBA",
  ibf: "IBF",
  wbo: "WBO",
  ring: "The Ring",
  tbrb: "TBRB",
};

export type RankedBoxer = {
  publisher: string;
  position: number;
  champion_flag: string | null;
  boxers: {
    id: number;
    name: string;
    country: string | null;
    wins: number | null;
    losses: number | null;
    draws: number | null;
    kos: number | null;
    boxerbook_slug: string | null;
  };
};

/** Resumen del catálogo: totales y conteos por división y por país. */
export async function getOverview() {
  const supabase = await createClient();

  // PostgREST entrega máx. 1000 filas por request: se pagina.
  const rows: { division: string | null; country: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("boxers")
      .select("division, country")
      .not("synced_at", "is", null)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const { data: champs } = await supabase.from("rankings").select("boxer_id").eq("position", 0);

  const byDivision = new Map<string, number>();
  const byCountry = new Map<string, number>();
  for (const r of rows) {
    if (r.division) byDivision.set(r.division, (byDivision.get(r.division) ?? 0) + 1);
    if (r.country) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
  }

  const order = [...DIVISIONS, ...WOMEN_DIVISIONS].map((d) => d.code);
  return {
    total: rows.length,
    champions: new Set(champs?.map((c) => c.boxer_id)).size,
    countries: byCountry.size,
    byDivision: order
      .filter((c) => byDivision.has(c))
      .map((code) => ({ code, count: byDivision.get(code)! })),
    topCountries: [...byCountry.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => ({ code, count })),
  };
}

/** Todos los rankings (todos los organismos) de una división. */
export async function getDivisionRankings(division: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rankings")
    .select(
      "publisher, position, champion_flag, boxers(id, name, country, wins, losses, draws, kos, boxerbook_slug)",
    )
    .eq("division", division)
    .order("position");
  if (error) throw error;
  return data as unknown as RankedBoxer[];
}
