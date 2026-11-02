import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { actualizarEvento, eliminarEvento, eliminarPelea } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { divisionName } from "@/lib/divisions";
import { createClient } from "@/lib/supabase/server";
import { formatChile, utcToChileInput } from "@/lib/time";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function EventoAdminPage(props: PageProps<"/admin/eventos/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
        ← Administración
      </Link>
      <Suspense fallback={<p className="mt-4 text-muted-foreground">Cargando…</p>}>
        <Detalle {...props} />
      </Suspense>
    </main>
  );
}

async function Detalle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: ev } = await supabase.from("events").select("*").eq("id", Number(id)).maybeSingle();
  if (!ev) notFound();

  const { data: bouts } = await supabase
    .from("bouts")
    .select(
      "id, card_position, division, title_text, status, a:boxers!boxer_a_id(name), b:boxers!boxer_b_id(name)",
    )
    .eq("event_id", ev.id)
    .order("card_position");

  type Named = { name: string };
  return (
    <>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{ev.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Inicio de la cartelera: {formatChile(ev.start_utc)} (hora de Chile)
      </p>

      {first(sp.ok) && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">{first(sp.ok)}</p>}
      {first(sp.error) && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {first(sp.error)}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Votación</CardTitle>
          <CardDescription>
            Los usuarios solo pueden votar con el estado «Votación abierta» y antes de la hora de
            cierre. Al cerrarse, los votos de todos quedan visibles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={actualizarEvento} className="flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="id" value={ev.id} />
            <label className="flex flex-col gap-1">
              Nombre
              <Input name="name" defaultValue={ev.name} className="w-72" required />
            </label>
            <label className="flex flex-col gap-1">
              Cierre (hora de Chile)
              <Input
                type="datetime-local"
                name="cierre"
                defaultValue={utcToChileInput(ev.voting_closes_at)}
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              Estado
              <select name="status" defaultValue={ev.status} className={SELECT_CLASS}>
                <option value="borrador">Borrador (oculto)</option>
                <option value="abierto">Votación abierta</option>
                <option value="cerrado">Cerrado</option>
                <option value="finalizado">Finalizado</option>
              </select>
            </label>
            <Button type="submit">Guardar</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Peleas ({bouts?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y text-sm">
            {bouts?.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">
                    {(b.a as unknown as Named).name} vs {(b.b as unknown as Named).name}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {[divisionName(b.division), b.title_text].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <form action={eliminarPelea}>
                  <input type="hidden" name="bout" value={b.id} />
                  <input type="hidden" name="event" value={ev.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Quitar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {ev.status === "borrador" && (
        <form action={eliminarEvento}>
          <input type="hidden" name="id" value={ev.id} />
          <Button type="submit" variant="destructive">
            Eliminar borrador
          </Button>
        </form>
      )}
    </>
  );
}
