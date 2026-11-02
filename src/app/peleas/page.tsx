import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { divisionName } from "@/lib/divisions";
import { inDays } from "@/lib/events";
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

type Pelea = {
  boxerbook_bout_id: number;
  event_key: string;
  event_date: string;
  start_utc: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  division: string | null;
  title_text: string | null;
  scheduled_rounds: number | null;
  a_name: string;
  a_record: string | null;
  b_name: string;
  b_record: string | null;
  display_first: "a" | "b";
  p_a: number | null;
};

async function Calendario({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const sp = await searchParams;
  const dias = first(sp.cuando) === "30d" ? 30 : 7;
  const hasta = inDays(dias);

  const supabase = await createClient();
  const { data } = await supabase
    .from("upcoming_bouts")
    .select("*")
    .lte("start_utc", hasta)
    .order("start_utc")
    .order("boxerbook_bout_id");
  const peleas = (data ?? []) as Pelea[];

  // Carteleras que el club ya publicó para votar.
  const { data: local } = peleas.length
    ? await supabase
        .from("bouts")
        .select("boxerbook_bout_id, event_id")
        .in("boxerbook_bout_id", peleas.map((b) => b.boxerbook_bout_id))
    : { data: [] };
  const eventOf = new Map(local?.map((b) => [b.boxerbook_bout_id, b.event_id]));

  const carteleras = new Map<string, Pelea[]>();
  for (const b of peleas) carteleras.set(b.event_key, [...(carteleras.get(b.event_key) ?? []), b]);

  const tab = (value: string, label: string) => (
    <Link
      href={`/peleas?cuando=${value}`}
      className={
        "rounded-full border px-3 py-1 text-sm transition-colors " +
        (dias === (value === "30d" ? 30 : 7) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")
      }
    >
      {label}
    </Link>
  );

  return (
    <>
      <div className="mb-6 flex gap-2">
        {tab("7d", "Próximos 7 días")}
        {tab("30d", "Próximos 30 días")}
      </div>

      <div className="flex flex-col gap-4">
        {[...carteleras.entries()].map(([key, bouts]) => {
          const ev = bouts[0];
          const place = [ev.venue, ev.city, ev.country].filter(Boolean).join(", ");
          const clubEvent = bouts.map((b) => eventOf.get(b.boxerbook_bout_id)).find((id) => id != null);
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {ev.start_utc ? formatChile(ev.start_utc) : ev.event_date}
                  {clubEvent && (
                    <Link href={`/eventos/${clubEvent}`}>
                      <Badge>Pronosticar →</Badge>
                    </Link>
                  )}
                </CardTitle>
                <CardDescription>
                  {place && `${place} · `}
                  {bouts.length} {bouts.length === 1 ? "pelea" : "peleas"} · hora de Chile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y text-sm">
                  {bouts.map((b) => {
                    const side = {
                      a: { name: b.a_name, record: b.a_record, pct: b.p_a == null ? null : Math.round(b.p_a * 100) },
                      b: { name: b.b_name, record: b.b_record, pct: b.p_a == null ? null : Math.round((1 - b.p_a) * 100) },
                    };
                    const [x, y] = b.display_first === "b" ? [side.b, side.a] : [side.a, side.b];
                    const info = [
                      divisionName(b.division),
                      b.title_text,
                      b.scheduled_rounds && `${b.scheduled_rounds} rounds`,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={b.boxerbook_bout_id} className="flex flex-col gap-0.5 py-2">
                        <span className="font-medium">
                          {x.name} <span className="font-normal text-muted-foreground">{x.record}</span>
                          <span className="mx-1.5 text-muted-foreground">vs</span>
                          {y.name} <span className="font-normal text-muted-foreground">{y.record}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {info}
                          {x.pct != null && ` · Modelo Boxerbook: ${x.pct}% – ${y.pct}%`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
        {!carteleras.size && (
          <p className="text-muted-foreground">
            No hay peleas en este período (o el calendario aún no se ha sincronizado).
          </p>
        )}
      </div>
    </>
  );
}
