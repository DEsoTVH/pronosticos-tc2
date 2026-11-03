import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { BoxerPhoto } from "@/components/boxer-photo";
import { FormDots, type FormFight } from "@/components/form-dots";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PUBLISHER_LABELS } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { DIVISIONS, WOMEN_DIVISIONS, divisionName, flag } from "@/lib/divisions";

const PAGE_SIZE = 40;

type Params = Record<string, string | string[] | undefined>;
type Boxer = {
  id: number;
  name: string;
  nickname: string | null;
  country: string | null;
  division: string | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  kos: number | null;
  stance: string | null;
  photo_url: string | null;
  rankings: { publisher: string; position: number; division: string }[] | null;
};
const STANCE: Record<string, string> = { orthodox: "Ortodoxo", southpaw: "Zurdo", switch: "Ambidiestro" };
const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function BoxeadoresPage({ searchParams }: PageProps<"/boxeadores">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Boxeadores</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Listado searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Listado({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const division = first(sp.division);
  const country = first(sp.country).toUpperCase();
  const sex = first(sp.sex);
  const rankeados = first(sp.rankeados) === "1";
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const orden = first(sp.orden) in PUBLISHER_LABELS ? first(sp.orden) : ""; // "" = por récord

  const supabase = await createClient();
  const boxerCols =
    "id, name, nickname, country, division, sex, wins, losses, draws, kos, stance, boxerbook_slug, photo_url";
  const range: [number, number] = [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1];

  let boxers: Boxer[] | null;
  let count: number | null;

  if (orden) {
    // Orden por ranking de una organización: se parte de la tabla de rankings (posición 0 = campeón).
    // Un boxeador rankeado aparece aunque aún no tenga ficha completa.
    let rq = supabase
      .from("rankings")
      .select(`publisher, division, position, boxers!inner(${boxerCols})`, { count: "exact" })
      .eq("publisher", orden);
    if (division) rq = rq.eq("division", division);
    if (q) rq = rq.ilike("boxers.name", `%${q.replace(/[%,]/g, " ")}%`);
    if (country) rq = rq.eq("boxers.country", country);
    if (sex === "male" || sex === "female") rq = rq.eq("boxers.sex", sex);
    const res = await rq.order("position").order("division").order("boxer_id").range(...range);
    count = res.count;
    boxers = ((res.data ?? []) as unknown as { publisher: string; division: string; position: number; boxers: Boxer }[]).map(
      (r) => ({ ...r.boxers, rankings: [{ publisher: r.publisher, position: r.position, division: r.division }] }),
    );
  } else {
    // Solo boxeadores con ficha cargada; "rankeados" exige estar en algún ranking.
    let query = supabase
      .from("boxers")
      .select(`${boxerCols}, rankings${rankeados ? "!inner" : ""}(publisher, position, division)`, { count: "exact" })
      .or("synced_at.not.is.null,is_manual.is.true"); // con ficha, o cargados a mano

    if (q) query = query.ilike("name", `%${q.replace(/[%,]/g, " ")}%`);
    if (division) query = query.eq("division", division);
    if (country) query = query.eq("country", country);
    if (sex === "male" || sex === "female") query = query.eq("sex", sex);

    const res = await query
      .order("wins", { ascending: false, nullsFirst: false })
      .order("name")
      .range(...range);
    count = res.count;
    boxers = res.data as unknown as Boxer[] | null;
  }

  // Últimas 6 peleas de los boxeadores de esta página (la vista ya las limita).
  const { data: recent } = boxers?.length
    ? await supabase
        .from("boxer_recent_fights")
        .select("boxer_id, result, opponent_name, method, round, fight_date")
        .in("boxer_id", boxers.map((b) => b.id))
        .order("rn")
    : { data: [] };
  const formOf = new Map<number, FormFight[]>();
  for (const r of (recent ?? []) as (FormFight & { boxer_id: number })[]) {
    formOf.set(r.boxer_id, [...(formOf.get(r.boxer_id) ?? []), r]);
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (division) u.set("division", division);
    if (country) u.set("country", country);
    if (sex) u.set("sex", sex);
    if (rankeados) u.set("rankeados", "1");
    if (orden) u.set("orden", orden);
    u.set("page", String(p));
    return `/boxeadores?${u}`;
  };

  return (
    <>
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre" className="w-56" />
        <select name="division" defaultValue={division} className={SELECT_CLASS}>
          <option value="">Todas las divisiones</option>
          <optgroup label="Masculinas">
            {DIVISIONS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Femeninas">
            {WOMEN_DIVISIONS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Input
          name="country"
          defaultValue={country}
          maxLength={2}
          placeholder="País (CL…)"
          className="w-28"
        />
        <select name="sex" defaultValue={sex} className={SELECT_CLASS}>
          <option value="">Ambos</option>
          <option value="male">Hombres</option>
          <option value="female">Mujeres</option>
        </select>
        <select name="orden" defaultValue={orden} className={SELECT_CLASS} aria-label="Ordenar por">
          <option value="">Orden: más victorias</option>
          {Object.entries(PUBLISHER_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              Ranking {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-1 text-sm">
          <input type="checkbox" name="rankeados" value="1" defaultChecked={rankeados} />
          Solo rankeados
        </label>
        <Button type="submit">Filtrar</Button>
        <Link href="/boxeadores" className={buttonVariants({ variant: "ghost" })}>
          Limpiar
        </Link>
      </form>

      <p className="mb-3 text-sm text-muted-foreground">
        {(count ?? 0).toLocaleString("es-CL")} {orden ? `en el ranking de ${PUBLISHER_LABELS[orden]}` : "boxeadores"}
      </p>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Boxeador</TableHead>
                <TableHead>División</TableHead>
                <TableHead>Récord (G-P-E)</TableHead>
                <TableHead className="text-right">KOs</TableHead>
                <TableHead>Guardia</TableHead>
                <TableHead>Últimas 6</TableHead>
                <TableHead>{orden ? PUBLISHER_LABELS[orden] : "Ranking"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boxers?.map((b) => {
                const best = b.rankings
                  ?.slice()
                  .sort((x, y) => x.position - y.position)[0];
                const nickname = b.nickname?.split(" · ")[0];
                return (
                  <TableRow key={`${b.id}-${best?.division ?? ""}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                      <BoxerPhoto url={b.photo_url} name={b.name} />
                      <span>
                      <span className="mr-1.5">{flag(b.country)}</span>
                      <Link href={`/boxeadores/${b.id}`} className="font-medium hover:underline">
                        {b.name}
                      </Link>
                      {nickname && (
                        <span className="ml-2 text-muted-foreground">“{nickname}”</span>
                      )}
                      </span>
                      </div>
                    </TableCell>
                    <TableCell>{divisionName(b.division) ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {b.wins == null ? "—" : `${b.wins}-${b.losses}-${b.draws}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.kos ?? "—"}</TableCell>
                    <TableCell>{b.stance ? (STANCE[b.stance] ?? b.stance) : "—"}</TableCell>
                    <TableCell>
                      <FormDots fights={formOf.get(b.id) ?? []} />
                    </TableCell>
                    <TableCell>
                      {best ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          {best.position === 0 ? <Badge>Campeón</Badge> : <Badge variant="secondary">#{best.position}</Badge>}
                          {orden && <span className="text-xs text-muted-foreground">{divisionName(best.division)}</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!boxers?.length && (
            <p className="py-6 text-muted-foreground">
              No hay boxeadores con esos filtros (o aún no se sincronizaron).
            </p>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 && <Link href={link(page - 1)}>← Anterior</Link>}
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          {page < totalPages && <Link href={link(page + 1)}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
