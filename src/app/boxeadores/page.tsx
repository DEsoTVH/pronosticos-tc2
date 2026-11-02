import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
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
import { createClient } from "@/lib/supabase/server";
import { DIVISIONS, WOMEN_DIVISIONS, divisionName, flag } from "@/lib/divisions";

const PAGE_SIZE = 40;

type Params = Record<string, string | string[] | undefined>;
const STANCE: Record<string, string> = { orthodox: "Ortodoxo", southpaw: "Zurdo", switch: "Ambidiestro" };
const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function BoxeadoresPage({ searchParams }: PageProps<"/boxeadores">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Boxeadores</h1>
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
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

  const supabase = await createClient();

  // Solo boxeadores con ficha cargada; "rankeados" exige estar en algún ranking.
  let query = supabase
    .from("boxers")
    .select(
      `id, name, nickname, country, division, sex, wins, losses, draws, kos, stance, reach_cm, boxerbook_slug,
       rankings${rankeados ? "!inner" : ""}(publisher, position)`,
      { count: "exact" },
    )
    .not("synced_at", "is", null);

  if (q) query = query.ilike("name", `%${q.replace(/[%,]/g, " ")}%`);
  if (division) query = query.eq("division", division);
  if (country) query = query.eq("country", country);
  if (sex === "male" || sex === "female") query = query.eq("sex", sex);

  const { data: boxers, count } = await query
    .order("wins", { ascending: false, nullsFirst: false })
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (division) u.set("division", division);
    if (country) u.set("country", country);
    if (sex) u.set("sex", sex);
    if (rankeados) u.set("rankeados", "1");
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
        {(count ?? 0).toLocaleString("es-CL")} boxeadores
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
                <TableHead className="text-right">Alcance</TableHead>
                <TableHead>Ranking</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boxers?.map((b) => {
                const best = (b.rankings as { publisher: string; position: number }[] | null)
                  ?.slice()
                  .sort((x, y) => x.position - y.position)[0];
                const nickname = b.nickname?.split(" · ")[0];
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <span className="mr-1.5">{flag(b.country)}</span>
                      {b.boxerbook_slug ? (
                        <a
                          href={`https://boxerbook.com/boxers/${b.boxerbook_slug}`}
                          className="font-medium hover:underline"
                        >
                          {b.name}
                        </a>
                      ) : (
                        <span className="font-medium">{b.name}</span>
                      )}
                      {nickname && (
                        <span className="ml-2 text-muted-foreground">“{nickname}”</span>
                      )}
                    </TableCell>
                    <TableCell>{divisionName(b.division) ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {b.wins == null ? "—" : `${b.wins}-${b.losses}-${b.draws}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.kos ?? "—"}</TableCell>
                    <TableCell>{b.stance ? (STANCE[b.stance] ?? b.stance) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.reach_cm ? `${b.reach_cm} cm` : "—"}
                    </TableCell>
                    <TableCell>
                      {best ? (
                        best.position === 0 ? (
                          <Badge>Campeón</Badge>
                        ) : (
                          <Badge variant="secondary">#{best.position}</Badge>
                        )
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
          <span className="text-zinc-500">
            Página {page} de {totalPages}
          </span>
          {page < totalPages && <Link href={link(page + 1)}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
