import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { guardarPerfil } from "./actions";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function PerfilPage({ searchParams }: PageProps<"/perfil">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Mi perfil</h1>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Formulario searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Formulario({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cómo te ven en el ranking</CardTitle>
        <CardDescription>{user.email}</CardDescription>
      </CardHeader>
      <CardContent>
        {first(sp.ok) && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">{first(sp.ok)}</p>}
        {first(sp.error) && (
          <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {first(sp.error)}
          </p>
        )}
        <form action={guardarPerfil} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Nombre para mostrar
            <Input name="display_name" defaultValue={perfil?.display_name ?? ""} maxLength={40} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Usuario (único)
            <Input name="username" defaultValue={perfil?.username ?? ""} required pattern="[a-z0-9_]{3,30}" />
            <span className="text-xs text-muted-foreground">Minúsculas, números y _ (3 a 30).</span>
          </label>
          <Button type="submit">Guardar</Button>
        </form>
      </CardContent>
    </Card>
  );
}
