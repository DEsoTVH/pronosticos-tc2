import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isVotingOpen } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { formatChile } from "@/lib/time";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Carteleras</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Vota quién gana, y si quieres arriesgar, cómo y en qué round.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <ListaEventos />
      </Suspense>
    </main>
  );
}

const ESTADO: Record<string, string> = {
  abierto: "Votación abierta",
  cerrado: "Cerrado",
  finalizado: "Finalizado",
};

async function ListaEventos() {
  await connection();
  const supabase = await createClient();
  const { data: eventos } = await supabase
    .from("events")
    .select("id, name, event_date, start_utc, status, voting_closes_at, venue, city, bouts(count)")
    .order("event_date", { ascending: false })
    .limit(20);

  if (!eventos?.length) {
    return <p className="text-muted-foreground">Aún no hay carteleras publicadas.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {eventos.map((e) => {
        const abierta = isVotingOpen(e);
        const peleas = (e.bouts as unknown as { count: number }[])[0]?.count ?? 0;
        return (
          <Link key={e.id} href={`/eventos/${e.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {e.name}
                  <Badge variant={abierta ? "default" : "secondary"}>
                    {abierta ? "Votación abierta" : ESTADO[e.status] === "Votación abierta" ? "Cerrado" : ESTADO[e.status]}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {formatChile(e.start_utc)} · {peleas} {peleas === 1 ? "pelea" : "peleas"}
                  {[e.venue, e.city].filter(Boolean).length > 0 && ` · ${[e.venue, e.city].filter(Boolean).join(", ")}`}
                </CardDescription>
              </CardHeader>
              {abierta && (
                <CardContent className="text-xs text-muted-foreground">
                  Cierra: {formatChile(e.voting_closes_at)}
                </CardContent>
              )}
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
