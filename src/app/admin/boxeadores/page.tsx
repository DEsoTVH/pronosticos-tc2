import { Suspense } from "react";
import Link from "next/link";
import { eliminarBoxeador, guardarBoxeador } from "@/app/admin/boxeadores/actions";
import { BoxerPhoto } from "@/components/boxer-photo";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { DIVISIONS, WOMEN_DIVISIONS, divisionName, flag } from "@/lib/divisions";
import { createClient } from "@/lib/supabase/server";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const PAGE_SIZE = 25;
const FILTROS = [
  ["todos", "Todos"],
  ["sinficha", "Sin ficha"],
  ["editados", "Editados por mí"],
] as const;

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function BoxeadoresAdminPage({ searchParams }: PageProps<"/admin/boxeadores">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
        ← Administración
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Boxeadores</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Agrega boxeadores profesionales que falten o corrige los que vienen de Boxerbook.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();

  const q = first(sp.q).trim();
  const filtro = FILTROS.some(([k]) => k === first(sp.f)) ? first(sp.f) : "todos";
  const page = Math.max(1, Number(first(sp.p)) || 1);

  let list = supabase
    .from("boxers")
    .select("id, name, nickname, country, division, wins, losses, draws, kos, photo_url, boxerbook_id, is_manual, sync_locked, synced_at", {
      count: "exact",
    })
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) list = list.ilike("name", `%${q.replace(/[%,]/g, " ")}%`);
  if (filtro === "sinficha") list = list.is("synced_at", null).eq("is_manual", false);
  if (filtro === "editados") list = list.or("is_manual.is.true,sync_locked.is.true");
  const { data: boxers, count } = await list;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const editId = Number(first(sp.editar)) || null;
  const { data: b } = editId
    ? await supabase.from("boxers").select("*").eq("id", editId).maybeSingle()
    : { data: null };
  const linked = !!b?.boxerbook_id;

  const href = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(filtro !== "todos" && { f: filtro }), ...extra } as Record<string, string>);
    return `/admin/boxeadores?${p}`;
  };

  const num = (name: string, label: string, v: number | null | undefined, w = "w-20") => (
    <label className="flex flex-col gap-1">
      {label}
      <Input type="number" min={0} name={name} defaultValue={v ?? ""} className={w} />
    </label>
  );

  return (
    <>
      {first(sp.ok) && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">{first(sp.ok)}</p>}
      {first(sp.error) && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {first(sp.error)}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{b ? `Editar: ${b.name}` : "Agregar boxeador"}</CardTitle>
          <CardDescription>
            {linked
              ? "Viene de Boxerbook. Corrige lo que necesites; los datos vacíos se quedan vacíos."
              : "Todo es opcional salvo el nombre. Si no sabes un dato, déjalo vacío."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form key={b?.id ?? "nuevo"} action={guardarBoxeador} className="flex flex-wrap items-end gap-3 text-sm">
            {b && <input type="hidden" name="id" value={b.id} />}
            {linked && <input type="hidden" name="linked" value="1" />}
            <label className="flex flex-col gap-1">
              Nombre *
              <Input name="name" defaultValue={b?.name ?? ""} required className="w-56" />
            </label>
            <label className="flex flex-col gap-1">
              Apodo
              <Input name="nickname" defaultValue={b?.nickname ?? ""} className="w-40" />
            </label>
            <label className="flex flex-col gap-1">
              País (2 letras)
              <Input name="country" defaultValue={b?.country ?? ""} maxLength={2} placeholder="CL" className="w-20 uppercase" />
            </label>
            <label className="flex flex-col gap-1">
              Sexo
              <select name="sex" defaultValue={b?.sex ?? ""} className={SELECT_CLASS}>
                <option value="">—</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              División
              <select name="division" defaultValue={b?.division ?? ""} className={SELECT_CLASS}>
                <option value="">—</option>
                <optgroup label="Hombres">
                  {DIVISIONS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Mujeres">
                  {WOMEN_DIVISIONS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name} (F)
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Guardia
              <select name="stance" defaultValue={b?.stance ?? ""} className={SELECT_CLASS}>
                <option value="">—</option>
                <option value="orthodox">Ortodoxo</option>
                <option value="southpaw">Zurdo</option>
                <option value="switch">Ambidiestro</option>
              </select>
            </label>
            {num("wins", "Victorias", b?.wins)}
            {num("losses", "Derrotas", b?.losses)}
            {num("draws", "Empates", b?.draws)}
            {num("kos", "KOs", b?.kos)}
            {num("height_cm", "Estatura (cm)", b?.height_cm, "w-24")}
            {num("reach_cm", "Alcance (cm)", b?.reach_cm, "w-24")}
            {linked && (
              <label className="flex basis-full items-center gap-2">
                <input type="checkbox" name="mantener" defaultChecked={b?.sync_locked ?? true} />
                Mantener mis cambios (no actualizar este boxeador desde Boxerbook)
              </label>
            )}
            <Button type="submit">{b ? "Guardar cambios" : "Agregar"}</Button>
            {b && (
              <Link href={href({})} className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista ({count ?? 0})</CardTitle>
          <CardDescription>Busca por nombre. «Sin ficha» son los que Boxerbook lista sin id: solo tenemos su nombre.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form className="flex flex-wrap items-center gap-2 text-sm">
            <Input name="q" defaultValue={q} placeholder="Buscar por nombre" className="w-64" />
            <select name="f" defaultValue={filtro} className={SELECT_CLASS}>
              {FILTROS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Buscar
            </Button>
          </form>

          <ul className="flex flex-col divide-y text-sm">
            {boxers?.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-3">
                  <BoxerPhoto url={x.photo_url} name={x.name} />
                  <span>
                    <span className="font-medium">
                      {flag(x.country)} {x.name}
                    </span>
                    {x.nickname && <span className="text-muted-foreground"> “{x.nickname.split(" · ")[0]}”</span>}
                    <span className="ml-2 text-muted-foreground">
                      {x.wins == null ? "sin récord" : `${x.wins}-${x.losses ?? 0}-${x.draws ?? 0} · ${x.kos ?? 0} KOs`}
                      {x.division && ` · ${divisionName(x.division)}`}
                    </span>
                    {!x.boxerbook_id && !x.is_manual && (
                      <Badge className="ml-2" variant="secondary">
                        sin ficha
                      </Badge>
                    )}
                    {!x.boxerbook_id && x.is_manual && (
                      <Badge className="ml-2" variant="outline">
                        manual
                      </Badge>
                    )}
                    {x.boxerbook_id && x.sync_locked && (
                      <Badge className="ml-2" variant="outline">
                        editado
                      </Badge>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Link
                    href={href({ editar: x.id, p: page })}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Editar
                  </Link>
                  {!x.boxerbook_id && (
                    <form action={eliminarBoxeador}>
                      <input type="hidden" name="id" value={x.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Eliminar
                      </Button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!boxers?.length && <p className="text-sm text-muted-foreground">Sin resultados.</p>}

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={href({ p: page - 1 })} className="underline">
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                Página {page} de {pages}
              </span>
              {page < pages ? (
                <Link href={href({ p: page + 1 })} className="underline">
                  Siguiente →
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
