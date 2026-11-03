import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inDays } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { formatChile, timeAgo } from "@/lib/time";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Suspense fallback={null}>
        <VotacionesAbiertas />
      </Suspense>
      <h1 className="mb-1 text-2xl font-semibold">Noticias del boxeo</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Titulares de distintos medios. Al pulsar uno, se abre la nota en el sitio original.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Noticias searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Lo central de la app es votar: las votaciones abiertas van arriba de las noticias.
async function VotacionesAbiertas() {
  await connection();
  const supabase = await createClient();
  const { data: abiertas } = await supabase
    .from("events")
    .select("id, name, start_utc, voting_closes_at")
    .eq("status", "abierto")
    .gt("voting_closes_at", inDays(0))
    .order("voting_closes_at");

  if (!abiertas?.length) return null;
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Votaciones abiertas</h2>
        <Link href="/votaciones" className="text-sm text-primary hover:underline">
          Ver todas →
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {abiertas.map((e) => (
          <Link key={e.id} href={`/eventos/${e.id}`}>
            <Card className="border-primary/40 transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {e.name}
                  <Badge>Votación abierta</Badge>
                </CardTitle>
                <CardDescription>
                  {formatChile(e.start_utc)} · cierra {formatChile(e.voting_closes_at)}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function Noticias({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const sp = await searchParams;
  const lang = first(sp.idioma) === "en" ? "en" : first(sp.idioma) === "es" ? "es" : null;

  const supabase = await createClient();
  let query = supabase
    .from("news")
    .select("id, url, title, source, lang, published_at")
    .order("published_at", { ascending: false })
    .limit(40);
  if (lang) query = query.eq("lang", lang);
  const { data: noticias } = await query;

  const pill = (href: string, label: string, active: boolean) => (
    <Link
      key={label}
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
    <>
      <div className="mb-4 flex gap-1.5">
        {pill("/", "Todas", !lang)}
        {pill("/?idioma=es", "Español", lang === "es")}
        {pill("/?idioma=en", "Inglés", lang === "en")}
      </div>

      {noticias?.length ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {noticias.map((n) => (
            <li key={n.id}>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="font-medium leading-snug">{n.title}</span>
                <span className="text-xs text-muted-foreground">
                  {n.source} · {n.lang === "en" ? "inglés · " : ""}
                  {timeAgo(n.published_at)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Aún no hay noticias cargadas.</p>
      )}
    </>
  );
}
