import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BoxerPhoto } from "@/components/boxer-photo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inDays, isVotingOpen } from "@/lib/events";
import { PUBLISHER_LABELS } from "@/lib/stats";
import { divisionName, flag } from "@/lib/divisions";
import { createClient } from "@/lib/supabase/server";
import { formatChile } from "@/lib/time";

const STANCE: Record<string, string> = { orthodox: "Ortodoxo", southpaw: "Zurdo", switch: "Ambidiestro" };

const RESULT_STYLE: Record<string, string> = {
  W: "bg-emerald-500/20 text-emerald-400",
  L: "bg-red-500/20 text-red-400",
  D: "bg-muted text-muted-foreground",
  NC: "bg-muted text-muted-foreground",
};

type Fight = {
  id: number;
  fight_date: string;
  opponent_name: string;
  opponent_boxerbook_id: number | null;
  result: "W" | "L" | "D" | "NC" | null;
  method: string | null;
  round: number | null;
  fight_time: string | null;
  scheduled_rounds: number | null;
  title_text: string | null;
  exhibition: boolean;
  record_before: string | null;
  opponent_record_before: string | null;
};

export default function BoxeadorPage(props: PageProps<"/boxeadores/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link href="/boxeadores" className="text-sm text-muted-foreground hover:underline">
        ← Boxeadores
      </Link>
      <Suspense fallback={<p className="mt-4 text-muted-foreground">Cargando…</p>}>
        <Ficha {...props} />
      </Suspense>
    </main>
  );
}

const Chip = ({ r }: { r: Fight["result"] }) => (
  <span
    className={`inline-flex size-6 items-center justify-center rounded text-xs font-bold ${RESULT_STYLE[r ?? "NC"]}`}
  >
    {r ?? "–"}
  </span>
);

type Proxima = {
  key: string;
  start: string | null;
  date: string;
  rival: string;
  rivalId: number | null;
  rivalRecord: string | null;
  division: string | null;
  title: string | null;
  rounds: number | null;
  eventId: number | null;
  eventName: string | null;
  canVote: boolean;
};

type ClubBout = {
  boxerbook_bout_id: number | null;
  boxer_a_id: number;
  division: string | null;
  title_text: string | null;
  scheduled_rounds: number | null;
  events: { id: number; name: string; event_date: string; start_utc: string | null; status: string; voting_closes_at: string };
  a: { id: number; name: string; wins: number | null; losses: number | null; draws: number | null };
  b: { id: number; name: string; wins: number | null; losses: number | null; draws: number | null };
};

const record = (x: { wins: number | null; losses: number | null; draws: number | null }) =>
  x.wins == null ? null : `${x.wins}-${x.losses ?? 0}-${x.draws ?? 0}`;

/**
 * Peleas por venir del boxeador: las de eventos del club (con enlace a votar) más las del calendario de
 * Boxerbook. Si una pelea está en ambos lados se muestra una sola vez, la del club.
 */
async function proximasPeleas(supabase: Awaited<ReturnType<typeof createClient>>, b: { id: number; name: string }) {
  const hoy = inDays(-1).slice(0, 10);

  const { data: clubRows } = await supabase
    .from("bouts")
    .select(
      "boxerbook_bout_id, boxer_a_id, division, title_text, scheduled_rounds, events!inner(id, name, event_date, start_utc, status, voting_closes_at), a:boxers!boxer_a_id(id, name, wins, losses, draws), b:boxers!boxer_b_id(id, name, wins, losses, draws)",
    )
    .or(`boxer_a_id.eq.${b.id},boxer_b_id.eq.${b.id}`)
    .eq("status", "programada")
    .gte("events.event_date", hoy);
  const club = (clubRows ?? []) as unknown as ClubBout[];
  const enClub = new Set(club.map((x) => x.boxerbook_bout_id).filter((x): x is number => x != null));

  // El calendario de Boxerbook solo trae nombres: se busca también con y sin Jr/Sr.
  const base = b.name.replace(/\s+(Jr|Sr)\.?$/i, "");
  const nombres = [...new Set([b.name, base, `${base} Jr`, `${base} Sr`])];
  const [{ data: comoA }, { data: comoB }] = await Promise.all([
    supabase.from("upcoming_bouts").select("*").in("a_name", nombres).gte("event_date", hoy),
    supabase.from("upcoming_bouts").select("*").in("b_name", nombres).gte("event_date", hoy),
  ]);
  type Cal = {
    boxerbook_bout_id: number;
    start_utc: string | null;
    event_date: string;
    division: string | null;
    title_text: string | null;
    scheduled_rounds: number | null;
    a_name: string;
    a_record: string | null;
    b_name: string;
    b_record: string | null;
  };
  const cal = [...(comoA ?? []), ...(comoB ?? [])] as Cal[];
  const calendario = cal.filter(
    (x, i) => !enClub.has(x.boxerbook_bout_id) && cal.findIndex((y) => y.boxerbook_bout_id === x.boxerbook_bout_id) === i,
  );

  // Rivales del calendario que también están en nuestra lista: se enlazan a su ficha.
  const rivalDe = (x: Cal) => (nombres.includes(x.a_name) ? { name: x.b_name, record: x.b_record } : { name: x.a_name, record: x.a_record });
  const rivalNames = [...new Set(calendario.map((x) => rivalDe(x).name))];
  const { data: locales } = rivalNames.length
    ? await supabase
        .from("boxers")
        .select("id, name")
        .in("name", rivalNames.flatMap((n) => [n, `${n} Jr`, `${n} Sr`]))
    : { data: [] };
  const idDe = (n: string) => {
    const hit = locales?.filter((x) => x.name === n || x.name === `${n} Jr` || x.name === `${n} Sr`) ?? [];
    return hit.length === 1 && hit[0].id !== b.id ? (hit[0].id as number) : null;
  };

  const lista: Proxima[] = [
    ...club.map((x): Proxima => {
      const rival = x.boxer_a_id === b.id ? x.b : x.a;
      return {
        key: `c${x.events.id}-${rival.id}`,
        start: x.events.start_utc,
        date: x.events.event_date,
        rival: rival.name,
        rivalId: rival.id,
        rivalRecord: record(rival),
        division: x.division,
        title: x.title_text,
        rounds: x.scheduled_rounds,
        eventId: x.events.id,
        eventName: x.events.name,
        canVote: isVotingOpen(x.events),
      };
    }),
    ...calendario.map((x): Proxima => {
      const rival = rivalDe(x);
      return {
        key: `b${x.boxerbook_bout_id}`,
        start: x.start_utc,
        date: x.event_date,
        rival: rival.name,
        rivalId: idDe(rival.name),
        rivalRecord: rival.record,
        division: x.division,
        title: x.title_text,
        rounds: x.scheduled_rounds,
        eventId: null,
        eventName: null,
        canVote: false,
      };
    }),
  ];
  return lista.sort((x, y) => (x.start ?? x.date).localeCompare(y.start ?? y.date));
}

async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const supabase = await createClient();
  const { data: b } = await supabase
    .from("boxers")
    .select("*, rankings(publisher, division, position, champion_flag)")
    .eq("id", Number(id))
    .maybeSingle();
  if (!b) notFound();

  const { data } = await supabase
    .from("boxer_fights")
    .select("*")
    .eq("boxer_id", b.id)
    .order("fight_date", { ascending: false })
    .order("id", { ascending: false });
  const fights = (data ?? []) as Fight[];

  // Rivales que también están en nuestra lista: se enlazan a su ficha.
  const oppIds = [...new Set(fights.map((f) => f.opponent_boxerbook_id).filter((x): x is number => !!x))];
  const { data: opps } = oppIds.length
    ? await supabase.from("boxers").select("id, boxerbook_id").in("boxerbook_id", oppIds)
    : { data: [] };
  const localOf = new Map(opps?.map((o) => [o.boxerbook_id as number, o.id as number]));

  // Peleas cargadas a mano no traen id de Boxerbook: se enlaza por nombre si hay un solo boxeador así
  // (también con "Jr" o "Sr": Boxerbook escribe "Errol Spence" y la lista puede tener "Errol Spence Jr").
  const byName = new Map<string, number | null>();
  const names = [...new Set(fights.filter((f) => !localOf.has(f.opponent_boxerbook_id ?? -1)).map((f) => f.opponent_name))];
  if (names.length) {
    const candidates = names.flatMap((n) => [n, `${n} Jr`, `${n} Sr`]);
    const { data: byN } = await supabase.from("boxers").select("id, name").in("name", candidates);
    for (const n of names) {
      const hit = byN?.filter((x) => x.name === n || x.name === `${n} Jr` || x.name === `${n} Sr`) ?? [];
      byName.set(n, hit.length === 1 && hit[0].id !== b.id ? hit[0].id : null);
    }
  }
  const opponentLink = (f: Fight) =>
    (f.opponent_boxerbook_id ? localOf.get(f.opponent_boxerbook_id) : undefined) ?? byName.get(f.opponent_name) ?? undefined;

  // Récord propio antes de cada pelea: el guardado, o se calcula sumando el historial si está completo.
  const total = (b.wins ?? 0) + (b.losses ?? 0) + (b.draws ?? 0);
  const complete = b.wins != null && fights.length === total;
  const before = new Map<number, string>();
  if (complete) {
    let w = 0, l = 0, d = 0;
    for (const f of [...fights].reverse()) {
      before.set(f.id, `${w}-${l}-${d}`);
      if (f.result === "W") w++;
      else if (f.result === "L") l++;
      else if (f.result === "D") d++;
    }
  }

  const proximas = await proximasPeleas(supabase, b);

  const rankings = (
    (b.rankings ?? []) as { publisher: string; division: string; position: number; champion_flag: string | null }[]
  )
    .slice()
    .sort((x, y) => x.position - y.position);
  const koPct = b.wins ? Math.round((100 * (b.kos ?? 0)) / b.wins) : null;
  const nickname = b.nickname?.split(" · ")[0];

  const stat = (label: string, value: string | number | null) => (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value ?? "—"}</p>
    </div>
  );

  return (
    <>
      <div className="mb-6 mt-4 flex flex-wrap items-center gap-5">
        <BoxerPhoto url={b.photo_url} name={b.name} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold">
            {flag(b.country)} {b.name}
          </h1>
          {nickname && <p className="text-muted-foreground">“{nickname}”</p>}
          <p className="mt-1 text-sm text-muted-foreground">
            {[b.city, divisionName(b.division), b.stance && STANCE[b.stance]].filter(Boolean).join(" · ")}
            {b.boxrec_id && (
              <>
                {" · "}
                <a href={`https://boxrec.com/en/box-pro/${b.boxrec_id}`} target="_blank" rel="noopener noreferrer" className="underline">
                  BoxRec
                </a>
              </>
            )}
          </p>
          {rankings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rankings.slice(0, 6).map((r) => (
                <Badge key={`${r.publisher}-${r.division}`} variant={r.position === 0 ? "default" : "secondary"}>
                  {PUBLISHER_LABELS[r.publisher] ?? r.publisher}: {r.position === 0 ? "Campeón" : `#${r.position}`}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stat("Récord (G-P-E)", b.wins == null ? null : `${b.wins}-${b.losses ?? 0}-${b.draws ?? 0}`)}
        {stat("KOs", b.kos)}
        {stat("% KO", koPct == null ? null : `${koPct}%`)}
        {stat("Estatura", b.height_cm ? `${b.height_cm} cm` : null)}
        {stat("Alcance", b.reach_cm ? `${b.reach_cm} cm` : null)}
        {stat("Peleas", fights.length || null)}
      </div>

      {proximas.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Próximas peleas</CardTitle>
            <CardDescription>Hora de Chile.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {proximas.map((p) => {
                const info = [divisionName(p.division), p.title, p.rounds && `${p.rounds} rounds`].filter(Boolean).join(" · ");
                return (
                  <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="font-medium">
                        vs{" "}
                        {p.rivalId ? (
                          <Link href={`/boxeadores/${p.rivalId}`} className="hover:underline">
                            {p.rival}
                          </Link>
                        ) : (
                          p.rival
                        )}{" "}
                        {p.rivalRecord && <span className="font-normal text-muted-foreground">{p.rivalRecord}</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {p.start ? formatChile(p.start) : p.date}
                        {p.eventName && ` · ${p.eventName}`}
                        {info && ` · ${info}`}
                      </span>
                    </span>
                    {p.eventId && (
                      <Link href={`/eventos/${p.eventId}`}>
                        <Badge variant={p.canVote ? "default" : "secondary"}>{p.canVote ? "Votar →" : "Ver evento →"}</Badge>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de peleas</CardTitle>
          <CardDescription>
            {fights.length ? (
              <span className="flex flex-wrap items-center gap-2">
                Últimas 5:
                <span className="flex gap-1">
                  {fights.slice(0, 5).map((f) => (
                    <Chip key={f.id} r={f.result} />
                  ))}
                </span>
              </span>
            ) : (
              "Aún no tenemos el historial de este boxeador."
            )}
          </CardDescription>
        </CardHeader>
        {fights.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Rival</TableHead>
                  <TableHead>Récord rival</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Su récord</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fights.map((f) => {
                  const local = opponentLink(f);
                  const how = [
                    f.method,
                    f.round && f.scheduled_rounds ? `${f.round}/${f.scheduled_rounds}` : f.round,
                    f.fight_time,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="w-10">
                        <Chip r={f.result} />
                      </TableCell>
                      <TableCell>
                        {local ? (
                          <Link href={`/boxeadores/${local}`} className="font-medium hover:underline">
                            {f.opponent_name}
                          </Link>
                        ) : (
                          <span className="font-medium">{f.opponent_name}</span>
                        )}
                        {(f.title_text || f.exhibition) && (
                          <p className="text-xs text-muted-foreground">
                            {f.exhibition ? "Exhibición" : f.title_text}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{f.opponent_record_before ?? "—"}</TableCell>
                      <TableCell>{how || "—"}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{f.fight_date}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {f.record_before ?? before.get(f.id) ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              «Récord rival» y «Su récord» son los de cada uno justo antes de la pelea.
              {b.boxerbook_id && (
                <>
                  {" "}
                  Datos de{" "}
                  <a href={`https://boxerbook.com/boxers/${b.boxerbook_slug}`} target="_blank" rel="noopener noreferrer" className="underline">
                    Boxerbook
                  </a>{" "}
                  (ODbL).
                </>
              )}
            </p>
          </CardContent>
        )}
      </Card>
    </>
  );
}
