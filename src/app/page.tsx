import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Carteleras</h1>
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
        <ListaEventos />
      </Suspense>
    </main>
  );
}

async function ListaEventos() {
  await connection();
  const supabase = await createClient();
  const { data: eventos } = await supabase
    .from("events")
    .select("id, name, event_date, status")
    .order("event_date", { ascending: false })
    .limit(10);

  return (
    <>
      {eventos?.length ? (
        <ul className="flex flex-col gap-2">
          {eventos.map((e) => (
            <li key={e.id} className="rounded border border-zinc-300 p-3">
              <span className="font-medium">{e.name}</span>{" "}
              <span className="text-sm text-zinc-500">
                {e.event_date} · {e.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">Aún no hay carteleras publicadas.</p>
      )}
    </>
  );
}
