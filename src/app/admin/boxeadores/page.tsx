import { Suspense } from "react";
import Link from "next/link";
import { eliminarBoxeador, guardarBoxeador } from "@/app/admin/boxeadores/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { DIVISIONS, WOMEN_DIVISIONS, divisionName, flag } from "@/lib/divisions";
import { createClient } from "@/lib/supabase/server";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function BoxeadoresAdminPage({ searchParams }: PageProps<"/admin/boxeadores">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
        ← Administración
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Boxeadores del club</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Boxeadores que cargas a mano. La sincronización con Boxerbook no los toca.
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

  const { data: manual } = await supabase
    .from("boxers")
    .select("*")
    .is("boxerbook_id", null)
    .order("created_at", { ascending: false });

  const editId = Number(first(sp.editar)) || null;
  const b = manual?.find((x) => x.id === editId) ?? null;

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
          <CardDescription>Todo es opcional salvo el nombre. Si no sabes un dato, déjalo vacío.</CardDescription>
        </CardHeader>
        <CardContent>
          <form key={b?.id ?? "nuevo"} action={guardarBoxeador} className="flex flex-wrap items-end gap-3 text-sm">
            {b && <input type="hidden" name="id" value={b.id} />}
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
            <Button type="submit">{b ? "Guardar cambios" : "Agregar"}</Button>
            {b && (
              <Link href="/admin/boxeadores" className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cargados a mano ({manual?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {manual?.length ? (
            <ul className="flex flex-col divide-y text-sm">
              {manual.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">
                      {flag(x.country)} {x.name}
                    </span>
                    {x.nickname && <span className="text-muted-foreground"> “{x.nickname}”</span>}
                    <span className="ml-2 text-muted-foreground">
                      {x.wins == null ? "sin récord" : `${x.wins}-${x.losses ?? 0}-${x.draws ?? 0} · ${x.kos ?? 0} KOs`}
                      {x.division && ` · ${divisionName(x.division)}`}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Link
                      href={`/admin/boxeadores?editar=${x.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Editar
                    </Link>
                    <form action={eliminarBoxeador}>
                      <input type="hidden" name="id" value={x.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Eliminar
                      </Button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no has cargado ninguno.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
