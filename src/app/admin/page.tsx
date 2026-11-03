import { Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatChile } from "@/lib/time";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Administración</h1>
        <div className="flex gap-2">
          <Link href="/admin/usuarios" className={buttonVariants({ variant: "outline" })}>
            Usuarios
          </Link>
          <Link href="/admin/boxeadores" className={buttonVariants({ variant: "outline" })}>
            Boxeadores
          </Link>
          <Link href="/admin/importar" className={buttonVariants()}>
            Importar cartelera
          </Link>
        </div>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Eventos searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const ESTADO: Record<string, string> = {
  borrador: "Borrador",
  abierto: "Votación abierta",
  cerrado: "Cerrado",
  finalizado: "Finalizado",
};

async function Eventos({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_date, status, voting_closes_at, bouts(count)")
    .order("event_date", { ascending: false });

  return (
    <>
      {first(sp.ok) && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">{first(sp.ok)}</p>}
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Cierre de votación</TableHead>
                <TableHead className="text-right">Peleas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{formatChile(e.voting_closes_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(e.bouts as unknown as { count: number }[])[0]?.count ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.status === "abierto" ? "default" : "secondary"}>
                      {ESTADO[e.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/eventos/${e.id}`} className="underline-offset-2 hover:underline">
                      Editar
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!events?.length && (
            <p className="py-6 text-muted-foreground">
              Aún no hay eventos. Importa una cartelera para empezar.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
