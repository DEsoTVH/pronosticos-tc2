import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inDays } from "@/lib/events";
import { embedUrl, parseStream } from "@/lib/stream";
import { createClient } from "@/lib/supabase/server";
import { formatChile } from "@/lib/time";

export default function EnVivoPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">En vivo</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Transmisiones del club. Si no hay una en curso, aquí aparecerá la próxima.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Transmisiones />
      </Suspense>
    </main>
  );
}

async function Transmisiones() {
  await connection();
  const host = (await headers()).get("host")?.split(":")[0] ?? "localhost";
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, name, status, start_utc, event_date, stream_url")
    .not("stream_url", "is", null)
    .order("start_utc", { ascending: false });

  const todas = (data ?? []).filter((e) => parseStream(e.stream_url));
  // Vigentes: no finalizadas y que empezaron hace menos de 12 h (o aún no empiezan).
  const desde = inDays(-0.5);
  const vigentes = todas
    .filter((e) => e.status !== "finalizado" && (e.start_utc ?? "") >= desde)
    .reverse(); // la más próxima primero
  const anteriores = todas.filter((e) => !vigentes.includes(e));

  return (
    <div className="flex flex-col gap-8">
      {vigentes.map((e) => (
        <section key={e.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{e.name}</h2>
            <Badge>📺 {formatChile(e.start_utc)}</Badge>
            <Link href={`/eventos/${e.id}`} className="text-sm text-primary hover:underline">
              Ver peleas y pronosticar →
            </Link>
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-xl border">
            <iframe
              src={embedUrl(parseStream(e.stream_url)!, host)}
              title={`Transmisión: ${e.name}`}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        </section>
      ))}

      {!vigentes.length && (
        <p className="text-muted-foreground">No hay ninguna transmisión programada por ahora.</p>
      )}

      {anteriores.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Anteriores</h2>
          <div className="flex flex-col gap-2">
            {anteriores.map((e) => (
              <Link key={e.id} href={`/eventos/${e.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{e.name}</CardTitle>
                    <CardDescription>{formatChile(e.start_utc)}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
