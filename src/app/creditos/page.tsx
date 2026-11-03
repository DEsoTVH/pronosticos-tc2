import { Suspense } from "react";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default function CreditosPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Créditos</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Datos de boxeo de{" "}
        <a href="https://boxerbook.com" className="underline">
          Boxerbook
        </a>{" "}
        (licencia ODbL). Las fotos vienen de Wikimedia Commons, con las licencias que se indican.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Fotos />
      </Suspense>
    </main>
  );
}

async function Fotos() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("boxers")
    .select("id, name, photo_page_url, photo_author, photo_license, photo_license_url")
    .not("photo_url", "is", null)
    .order("name");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fotos ({data?.length ?? 0})</CardTitle>
        <CardDescription>Cada nombre enlaza a la ficha de la imagen en Wikimedia Commons.</CardDescription>
      </CardHeader>
      <CardContent>
        {data?.length ? (
          <ul className="flex flex-col divide-y text-sm">
            {data.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-x-4 py-2">
                <a href={b.photo_page_url ?? "#"} className="font-medium hover:underline">
                  {b.name}
                </a>
                <span className="text-muted-foreground">
                  {b.photo_author ?? "Autor desconocido"} ·{" "}
                  {b.photo_license_url ? (
                    <a href={b.photo_license_url} className="underline">
                      {b.photo_license ?? "licencia"}
                    </a>
                  ) : (
                    (b.photo_license ?? "licencia no indicada")
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay fotos.</p>
        )}
      </CardContent>
    </Card>
  );
}
