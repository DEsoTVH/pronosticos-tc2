"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function RestablecerPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Solo se puede elegir contraseña nueva si se llegó desde el enlace del correo (sesión abierta).
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setSesion(!!data.user));
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repetir) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(/different from the old/i.test(error.message) ? "Elige una contraseña distinta a la anterior." : error.message);
      setCargando(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Nueva contraseña</h1>
      {sesion === false ? (
        <p className="text-sm text-muted-foreground">
          Este enlace ya no es válido.{" "}
          <Link href="/login" className="underline">
            Pide uno nuevo desde «¿Olvidaste tu contraseña?»
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={guardar} className="flex flex-col gap-3">
          <Input
            type="password"
            required
            minLength={6}
            placeholder="Contraseña nueva"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            type="password"
            required
            minLength={6}
            placeholder="Repite la contraseña"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
          />
          <Button type="submit" disabled={cargando || sesion === null}>
            Guardar contraseña
          </Button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </main>
  );
}
