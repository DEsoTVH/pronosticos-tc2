import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { eventKey, getScheduleCached } from "@/lib/boxerbook/schedule";
import { divisionName } from "@/lib/divisions";
import { createClient } from "@/lib/supabase/server";
import { formatChile } from "@/lib/time";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function PeleasPage({ searchParams }: PageProps<"/peleas">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Próximas peleas</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Carteleras de boxeo profesional según Boxerbook. Las que el club vota tienen enlace para pronosticar.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Buscando carteleras…</p>}>
        <Calendario searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Calendario({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const sp = await searchParams;
  const cuando = first(sp.cuando) === "30d" ? "30d" : "weekend";
  const schedule = (await getScheduleCached(cuando)).sort((a, b) =>
    (a.start_utc ?? a.date).localeCompare(b.start_utc ?? b.date),
  );

  // Carteleras que el club ya publicó para votar.
  const supabase = await createClient();
  const ids = schedule.flatMap((e) => e.bouts.map((b) => b.id));
  const { data: local } = ids.length
    ? await supabase.from("bouts").select("boxerbook_bout_id, event_id").in("boxerbook_bout_id", ids)
    : { data: [] };
  const eventOf = new Map(local?.map((b) => [b.boxerbook_bout_id, b.event_id]));

  const tab = (value: string, label: string) => (
    <Link
      href={`/peleas?cuando=${value}`}
      className={
        "rounded-full border px-3 py-1 text-sm transition-colors " +
        (cuando === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")
      }
    >
      {label}
    </Link>
  );

  return (
    <>
      <div className="mb-6 flex gap-2">
        {tab("weekend", "Este fin de semana")}
        {tab("30d", "Próximos 30 días")}
      </div>

      <div className="flex flex-col gap-4">
        {schedule.map((ev) => {
          const start = ev.start_utc ?? ev.bouts.find((b) => b.start_utc)?.start_utc;
          const place = [ev.venue, ev.city, ev.country].filter(Boolean).join(", ");
          const clubEvent = ev.bouts.map((b) => eventOf.get(b.id)).find((id) => id != null);
          return (
            <Card key={eventKey(ev)}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {start ? formatChile(start) : ev.date}
                  {clubEvent && (
                    <Link href={`/eventos/${clubEvent}`}>
                      <Badge>Pronosticar →</Badge>
                    </Link>
                  )}
                </CardTitle>
                <CardDescription>
                  {place && `${place} · `}
                  {ev.bouts.length} {ev.bouts.length === 1 ? "pelea" : "peleas"} · hora de Chile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y text-sm">
                  {ev.bouts.map((b) => {
                    const [x, y] = b.display?.[0] === "b" ? (["b", "a"] as const) : (["a", "b"] as const);
                    const p = b.forecast?.p_a;
                    const pct = (k: "a" | "b") => (p == null ? null : Math.round((k === "a" ? p : 1 - p) * 100));
                    const info = [divisionName(b.division ?? null), b.title_text, b.scheduled_rounds && `${b.scheduled_rounds} rounds`]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={b.id} className="flex flex-col gap-0.5 py-2">
                        <span className="font-medium">
                          {b[x].name} <span className="font-normal text-muted-foreground">{b[x].record}</span>
                          <span className="mx-1.5 text-muted-foreground">vs</span>
                          {b[y].name} <span className="font-normal text-muted-foreground">{b[y].record}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {info}
                          {p != null && ` · Modelo Boxerbook: ${pct(x)}% – ${pct(y)}%`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
        {!schedule.length && <p className="text-muted-foreground">No hay carteleras en este período.</p>}
      </div>
    </>
  );
}
