import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type Row = {
  user_id: string;
  name: string;
  is_bot: boolean;
  points: number;
  scored: number;
  correct: number;
};

export default function RankingPage({ searchParams }: PageProps<"/ranking">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Ranking de pronósticos</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Los puntos se suman cuando se confirma el resultado de cada pelea.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const accuracy = (r: Row) => (r.scored ? r.correct / r.scored : -1);

// Más puntos, luego mayor porcentaje de acierto, luego más ganadores acertados.
function sortRows(rows: Row[]) {
  return rows.sort(
    (a, b) => b.points - a.points || accuracy(b) - accuracy(a) || b.correct - a.correct,
  );
}

// Empates exactos comparten posición (1, 2, 2, 4…).
function withPositions(rows: Row[]) {
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    const tie =
      prev && prev.points === r.points && accuracy(prev) === accuracy(r) && prev.correct === r.correct;
    return { ...r, pos: tie ? -1 : i + 1 };
  });
}

async function Contenido({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_date, status")
    .neq("status", "borrador")
    .order("event_date", { ascending: false });

  const eventId = Number(first(sp.evento)) || null;
  const selected = events?.find((e) => e.id === eventId) ?? null;

  let rows: Row[];
  if (selected) {
    const { data } = await supabase
      .from("event_leaderboard")
      .select("user_id, username, is_bot, points, bouts_scored, correct_winners")
      .eq("event_id", selected.id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", data?.map((d) => d.user_id) ?? []);
    const names = new Map(profiles?.map((p) => [p.id, p.display_name]));
    rows = (data ?? []).map((d) => ({
      user_id: d.user_id,
      name: names.get(d.user_id) ?? d.username,
      is_bot: d.is_bot,
      points: Number(d.points),
      scored: Number(d.bouts_scored),
      correct: Number(d.correct_winners),
    }));
  } else {
    const { data } = await supabase
      .from("leaderboard")
      .select("user_id, username, display_name, is_bot, total_points, bouts_scored, correct_winners");
    rows = (data ?? []).map((d) => ({
      user_id: d.user_id,
      name: d.display_name ?? d.username,
      is_bot: d.is_bot,
      points: Number(d.total_points),
      scored: Number(d.bouts_scored),
      correct: Number(d.correct_winners),
    }));
  }
  // Solo quienes ya tienen peleas puntuadas (o el propio usuario, para que se vea en la lista).
  const table = withPositions(sortRows(rows.filter((r) => r.scored > 0)));

  // Historial: ganador de cada evento finalizado.
  const { data: history } = await supabase
    .from("leaderboard_history")
    .select("event_id, user_id, event_points, event_rank")
    .eq("event_rank", 1);
  const { data: winners } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("id", history?.map((h) => h.user_id) ?? []);
  const winnerName = new Map(winners?.map((p) => [p.id, p.display_name ?? p.username]));

  const pill = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={
        "rounded-full border px-3 py-1 text-xs transition-colors " +
        (active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-1.5">
        {pill("/ranking", "General", !selected)}
        {events?.map((e) => pill(`/ranking?evento=${e.id}`, e.name, selected?.id === e.id))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{selected ? selected.name : "Tabla general"}</CardTitle>
          <CardDescription>
            {selected ? "Puntos de este evento." : "Puntos acumulados de todos los eventos."} Desempate:
            porcentaje de acierto y luego ganadores acertados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Participante</TableHead>
                <TableHead className="text-right">Puntos</TableHead>
                <TableHead className="text-right">Peleas</TableHead>
                <TableHead className="text-right">Aciertos</TableHead>
                <TableHead className="text-right">% acierto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.map((r) => (
                <TableRow key={r.user_id} className={r.user_id === user?.id ? "bg-primary/5" : undefined}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.pos > 0 ? r.pos : "="}
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.name}
                    {r.is_bot && (
                      <Badge className="ml-2" variant="secondary">
                        bot
                      </Badge>
                    )}
                    {r.user_id === user?.id && (
                      <Badge className="ml-2" variant="outline">
                        tú
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-base font-semibold tabular-nums">{r.points}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.scored}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.correct}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.scored ? `${Math.round((100 * r.correct) / r.scored)}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!table.length && (
            <p className="py-6 text-muted-foreground">
              Aún no hay puntos. Aparecerán cuando se confirmen los resultados de las peleas votadas.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ganadores por evento</CardTitle>
          <CardDescription>Se guarda al finalizar cada evento.</CardDescription>
        </CardHeader>
        <CardContent>
          {history?.length ? (
            <ul className="flex flex-col divide-y text-sm">
              {history.map((h) => {
                const ev = events?.find((e) => e.id === h.event_id);
                return (
                  <li key={`${h.event_id}-${h.user_id}`} className="flex justify-between gap-3 py-2">
                    <Link href={`/ranking?evento=${h.event_id}`} className="hover:underline">
                      {ev?.name ?? `Evento ${h.event_id}`}
                    </Link>
                    <span>
                      <b>{winnerName.get(h.user_id)}</b>{" "}
                      <span className="tabular-nums text-muted-foreground">· {h.event_points} pts</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no hay eventos finalizados con votos.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
