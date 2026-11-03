import { Suspense } from "react";
import Link from "next/link";
import { cambiarRol } from "@/app/admin/usuarios/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const ROLES = [
  ["usuario", "Usuario"],
  ["miembro", "Miembro"],
  ["admin", "Admin"],
] as const;
const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default function UsuariosPage({ searchParams }: PageProps<"/admin/usuarios">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
        ← Administración
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Usuarios y roles</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        <b>Usuario</b>: todo el que se registra. <b>Miembro</b>: alumnos o integrantes del club, lo asignas tú.{" "}
        <b>Admin</b>: puede editar todo.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Lista searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Lista({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = first(sp.q).trim().toLowerCase();
  const filtro = ROLES.some(([k]) => k === first(sp.r)) ? first(sp.r) : "";

  // Los correos viven en el sistema de acceso: solo el servidor, con la clave de servicio, puede leerlos.
  const db = createAdminClient();
  const [{ data: perfiles }, { data: auth }] = await Promise.all([
    db.from("profiles").select("id, username, display_name, role, is_bot, created_at").order("created_at", { ascending: false }),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const emailOf = new Map(auth?.users.map((u) => [u.id, u.email ?? ""]));
  const ingresoOf = new Map(auth?.users.map((u) => [u.id, u.last_sign_in_at]));

  const todos = (perfiles ?? []).filter((p) => !p.is_bot);
  const cuenta = (r: string) => todos.filter((p) => p.role === r).length;
  const lista = todos.filter(
    (p) =>
      (!filtro || p.role === filtro) &&
      (!q || `${p.username} ${p.display_name ?? ""} ${emailOf.get(p.id) ?? ""}`.toLowerCase().includes(q)),
  );

  const pill = (r: string, label: string, n: number) => (
    <Link
      key={r}
      href={`/admin/usuarios?${new URLSearchParams({ ...(q && { q }), ...(r && { r }) })}`}
      className={
        "rounded-full border px-3 py-1 text-xs transition-colors " +
        (filtro === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")
      }
    >
      {label} ({n})
    </Link>
  );

  return (
    <>
      {first(sp.ok) && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">{first(sp.ok)}</p>}
      {first(sp.error) && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{first(sp.error)}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pill("", "Todos", todos.length)}
        {ROLES.map(([k, label]) => pill(k, label, cuenta(k)))}
      </div>
      <form className="mb-4 flex gap-2 text-sm">
        {filtro && <input type="hidden" name="r" value={filtro} />}
        <Input name="q" defaultValue={first(sp.q)} placeholder="Buscar por nombre o correo" className="w-72" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{lista.length} usuarios</CardTitle>
          <CardDescription>El cambio de rol se aplica al pulsar «Guardar» en cada fila.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y text-sm">
            {lista.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="font-medium">{p.display_name ?? p.username}</span>
                  {p.id === me.id && (
                    <Badge className="ml-2" variant="outline">
                      tú
                    </Badge>
                  )}
                  <span className="block truncate text-xs text-muted-foreground">
                    {emailOf.get(p.id)} · @{p.username} · registro {p.created_at.slice(0, 10)}
                    {ingresoOf.get(p.id) ? ` · último ingreso ${ingresoOf.get(p.id)!.slice(0, 10)}` : " · nunca ha ingresado"}
                  </span>
                </span>
                {p.id === me.id ? (
                  <Badge>{ROLES.find(([k]) => k === p.role)?.[1]}</Badge>
                ) : (
                  <form action={cambiarRol} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="q" value={first(sp.q)} />
                    <input type="hidden" name="r" value={filtro} />
                    <select name="role" defaultValue={p.role} className={SELECT_CLASS}>
                      {ROLES.map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm">
                      Guardar
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {!lista.length && <p className="py-4 text-sm text-muted-foreground">Sin resultados.</p>}
        </CardContent>
      </Card>
    </>
  );
}
