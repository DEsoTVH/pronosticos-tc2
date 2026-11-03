import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BoxerPhoto } from "@/components/boxer-photo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  const { data: nextRows } = await supabase
    .from("upcoming_bouts")
    .select("start_utc, a_name, b_name, title_text")
    .or(`a_name.eq."${b.name.replace(/"/g, "")}",b_name.eq."${b.name.replace(/"/g, "")}"`)
    .order("start_utc")
    .limit(1);
  const next = nextRows?.[0];

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
                <a href={`https://boxrec.com/box-pro/${b.boxrec_id}`} className="underline">
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

      {next && (
        <p className="mb-6 rounded-lg border px-3 py-2 text-sm">
          Próxima pelea: <b>{next.a_name === b.name ? next.b_name : next.a_name}</b>
          {next.start_utc && ` · ${formatChile(next.start_utc)}`}
          {next.title_text && ` · ${next.title_text}`}
        </p>
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
                  <a href={`https://boxerbook.com/boxers/${b.boxerbook_slug}`} className="underline">
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
