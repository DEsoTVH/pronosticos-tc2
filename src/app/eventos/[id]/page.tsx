import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { guardarPronosticos } from "@/app/eventos/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { divisionName, flag } from "@/lib/divisions";
import { hasClosed, isVotingOpen } from "@/lib/events";
import { embedUrl, parseStream } from "@/lib/stream";
import { createClient } from "@/lib/supabase/server";
import { formatChile } from "@/lib/time";
import { BoutPick } from "./bout-pick";
import { Countdown } from "./countdown";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type Boxer = {
  name: string;
  country: string | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  kos: number | null;
};
type Pick = {
  bout_id: number;
  user_id: string;
  pick: "a" | "b" | "draw";
  method_pick: string | null;
  round_pick: number | null;
  points: number | null;
  profiles: { username: string; display_name: string | null; is_bot: boolean } | null;
};

const METHOD_LABEL: Record<string, string> = { KO: "KO/TKO", DEC: "Decisión", OTRO: "Otro" };

function record(b: Boxer) {
  return b.wins == null ? "sin ficha" : `${b.wins}-${b.losses}-${b.draws} · ${b.kos} KOs`;
}

export default function EventoPage(props: PageProps<"/eventos/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Carteleras
      </Link>
      <Suspense fallback={<p className="mt-4 text-muted-foreground">Cargando…</p>}>
        <Contenido {...props} />
      </Suspense>
    </main>
  );
}

async function Contenido({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ev } = await supabase.from("events").select("*").eq("id", Number(id)).maybeSingle();
  if (!ev) notFound(); // los borradores no son visibles (RLS)

  const { data: bouts } = await supabase
    .from("bouts")
    .select(
      `id, card_position, division, title_text, scheduled_rounds, display_order, status, winner, method, result_round, bb_forecast_p_a,
       a:boxers!boxer_a_id(name, country, wins, losses, draws, kos),
       b:boxers!boxer_b_id(name, country, wins, losses, draws, kos)`,
    )
    .eq("event_id", ev.id)
    .order("card_position");

  const stream = parseStream(ev.stream_url);
  const host = (await headers()).get("host")?.split(":")[0] ?? "localhost";
  const open = isVotingOpen(ev);
  const revealed = hasClosed(ev);

  // Mis votos siempre; los de todos solo cuando cerró la votación (lo exige la base de datos).
  const { data: picks } = await supabase
    .from("predictions")
    .select("bout_id, user_id, pick, method_pick, round_pick, points, profiles(username, display_name, is_bot)")
    .in("bout_id", bouts?.map((b) => b.id) ?? []);
  const allPicks = (picks ?? []) as unknown as Pick[];
  const mine = new Map(allPicks.filter((p) => p.user_id === user?.id).map((p) => [p.bout_id, p]));

  const total = [...mine.values()].reduce((s, p) => s + (p.points ?? 0), 0);

  const list = (
    <div className="flex flex-col gap-4">
      {bouts?.map((b) => {
        const a = b.a as unknown as Boxer;
        const bb = b.b as unknown as Boxer;
        const byKey = { a, b: bb };
        const order: ("a" | "b")[] = b.display_order?.[0] === "b" ? ["b", "a"] : ["a", "b"];
        const sides = order.map((k) => ({
          key: k,
          name: `${flag(byKey[k].country)} ${byKey[k].name}`.trim(),
          detail: record(byKey[k]),
        })) as [
          { key: "a" | "b"; name: string; detail: string },
          { key: "a" | "b"; name: string; detail: string },
        ];
        const my = mine.get(b.id);
        const p = b.bb_forecast_p_a;
        const boutPicks = allPicks.filter((x) => x.bout_id === b.id);
        const nameOf = (k: string) => (k === "draw" ? "Empate" : byKey[k as "a" | "b"].name);

        return (
          <Card key={b.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {[divisionName(b.division), b.title_text].filter(Boolean).join(" · ") || "Pelea"}
                {b.status === "terminada" && <Badge>Terminada</Badge>}
                {b.status === "cancelada" && <Badge variant="secondary">Cancelada · no cuenta</Badge>}
              </CardTitle>
              {p != null && (
                <p className="text-xs text-muted-foreground">
                  Modelo Boxerbook: {nameOf(order[0])} {Math.round((order[0] === "a" ? p : 1 - p) * 100)}% ·{" "}
                  {nameOf(order[1])} {Math.round((order[1] === "a" ? p : 1 - p) * 100)}%
                </p>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {open && user ? (
                <BoutPick
                  boutId={b.id}
                  sides={sides}
                  rounds={b.scheduled_rounds && b.scheduled_rounds <= 12 ? b.scheduled_rounds : 12}
                  initial={{
                    pick: my?.pick ?? "",
                    method: my?.method_pick ?? "",
                    round: my?.round_pick ?? null,
                  }}
                />
              ) : (
                <>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    {sides.map((s) => (
                      <div key={s.key} className="rounded-lg border px-3 py-2">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.detail}</p>
                      </div>
                    ))}
                  </div>
                  {my ? (
                    <p className="text-sm">
                      Tu voto: <b>{nameOf(my.pick)}</b>
                      {my.method_pick && ` · ${METHOD_LABEL[my.method_pick]}`}
                      {my.round_pick && ` · round ${my.round_pick}`}
                      {my.points != null && (
                        <Badge className="ml-2" variant={my.points > 0 ? "default" : "secondary"}>
                          {my.points} pts
                        </Badge>
                      )}
                    </p>
                  ) : (
                    user && <p className="text-sm text-muted-foreground">No votaste esta pelea.</p>
                  )}
                </>
              )}

              {b.status === "terminada" && b.winner && (
                <p className="text-sm">
                  Resultado:{" "}
                  <b>{b.winner === "nc" ? "Sin decisión" : b.winner === "draw" ? "Empate" : nameOf(b.winner)}</b>
                  {b.method && ` · ${b.method}`}
                  {b.result_round && ` · round ${b.result_round}`}
                </p>
              )}

              {revealed && boutPicks.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Votos del club ({boutPicks.length})
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {boutPicks.map((x) => (
                      <li key={x.user_id} className="flex justify-between gap-3">
                        <span>
                          {x.profiles?.display_name ?? x.profiles?.username}
                          {x.profiles?.is_bot && <Badge className="ml-2" variant="secondary">bot</Badge>}
                          <span className="text-muted-foreground">
                            {" "}
                            → {nameOf(x.pick)}
                            {x.method_pick && ` · ${METHOD_LABEL[x.method_pick]}`}
                            {x.round_pick && ` · r${x.round_pick}`}
                          </span>
                        </span>
                        {x.points != null && <span className="tabular-nums">{x.points} pts</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  return (
    <>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{ev.name}</h1>
      <p className="mb-1 text-sm text-muted-foreground">
        {formatChile(ev.start_utc)} · hora de Chile
        {[ev.venue, ev.city].filter(Boolean).length > 0 && ` · ${[ev.venue, ev.city].filter(Boolean).join(", ")}`}
      </p>
      <p className="mb-6 text-sm">
        {open ? <Countdown closesAt={ev.voting_closes_at} /> : <span>Votación cerrada</span>}
        {user && mine.size > 0 && ev.status === "finalizado" && (
          <Badge className="ml-3">Tus puntos: {total}</Badge>
        )}
      </p>

      {stream && (
        <div className="mb-6 aspect-video w-full overflow-hidden rounded-xl border">
          <iframe
            src={embedUrl(stream, host)}
            title="Transmisión en vivo"
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}

      {first(sp.ok) && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">{first(sp.ok)}</p>}
      {first(sp.error) && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {first(sp.error)}
        </p>
      )}

      {open && !user && (
        <p className="mb-4 rounded-lg border px-3 py-2 text-sm">
          <Link href="/login" className="font-medium underline">
            Entra o crea tu cuenta
          </Link>{" "}
          para votar.
        </p>
      )}

      {open && user ? (
        <form action={guardarPronosticos} className="flex flex-col gap-4">
          <input type="hidden" name="event" value={ev.id} />
          {list}
          <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
            <Button type="submit">Guardar mis pronósticos</Button>
            <span className="ml-3 text-xs text-muted-foreground">
              Puedes cambiarlos hasta el cierre.
            </span>
          </div>
        </form>
      ) : (
        list
      )}
    </>
  );
}
