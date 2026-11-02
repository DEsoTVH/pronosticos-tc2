import { Suspense } from "react";
import Link from "next/link";
import { importarCartelera } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { eventKey, getScheduleCached } from "@/lib/boxerbook/schedule";
import { divisionName } from "@/lib/divisions";
import { createClient } from "@/lib/supabase/server";
import { formatChile } from "@/lib/time";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function ImportarPage({ searchParams }: PageProps<"/admin/importar">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
        ← Administración
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Importar cartelera</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Elige las peleas que se van a votar. Se crean como borrador; después ajustas la hora de
        cierre y abres la votación.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Buscando carteleras en Boxerbook…</p>}>
        <Calendario searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Calendario({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const sp = await searchParams;
  const cuando = first(sp.cuando) === "30d" ? "30d" : "weekend";
  const schedule = await getScheduleCached(cuando);

  // Peleas que ya están importadas.
  const supabase = await createClient();
  const ids = schedule.flatMap((e) => e.bouts.map((b) => b.id));
  const { data: existing } = ids.length
    ? await supabase.from("bouts").select("boxerbook_bout_id").in("boxerbook_bout_id", ids)
    : { data: [] };
  const imported = new Set(existing?.map((b) => b.boxerbook_bout_id));

  const tab = (value: string, label: string) => (
    <Link
      href={`/admin/importar?cuando=${value}`}
      className={
        "rounded-full border px-3 py-1 text-sm " +
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
      {first(sp.error) && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {first(sp.error)}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {schedule.map((ev) => {
          const start = ev.start_utc ?? ev.bouts.find((b) => b.start_utc)?.start_utc;
          const place = [ev.venue, ev.city, ev.country].filter(Boolean).join(", ");
          return (
            <Card key={eventKey(ev)}>
              <form action={importarCartelera}>
                <input type="hidden" name="cuando" value={cuando} />
                <input type="hidden" name="key" value={eventKey(ev)} />
                <CardHeader>
                  <CardTitle>
                    {start ? formatChile(start) : ev.date}
                    {place && <span className="ml-2 font-normal text-muted-foreground">{place}</span>}
                  </CardTitle>
                  <CardDescription>{ev.bouts.length} peleas · hora de Chile</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {ev.bouts.map((b) => (
                      <li key={b.id} className="flex items-center gap-2">
                        {imported.has(b.id) ? (
                          <Badge variant="secondary">ya importada</Badge>
                        ) : (
                          <input type="checkbox" name="bout" value={b.id} defaultChecked />
                        )}
                        <span className="font-medium">
                          {b.a.name} <span className="text-muted-foreground">{b.a.record}</span> vs{" "}
                          {b.b.name} <span className="text-muted-foreground">{b.b.record}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {[divisionName(b.division ?? null), b.title_text].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <Button type="submit">Importar seleccionadas</Button>
                  </div>
                </CardContent>
              </form>
            </Card>
          );
        })}
        {!schedule.length && (
          <p className="text-muted-foreground">No hay carteleras en este período.</p>
        )}
      </div>
    </>
  );
}
