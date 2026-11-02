"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<"entrar" | "registrar">("entrar");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setMensaje(null);
    const supabase = createClient();

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMensaje(error.message);
      else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setMensaje(
        error ? error.message : "Listo. Revisa tu correo para confirmar la cuenta.",
      );
    }
    setCargando(false);
  }

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">
        {modo === "entrar" ? "Entrar" : "Crear cuenta"}
      </h1>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <Input
          type="email"
          required
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="password"
          required
          minLength={6}
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={cargando}>
          {modo === "entrar" ? "Entrar" : "Registrarme"}
        </Button>
      </form>
      {mensaje && <p className="mt-3 text-sm text-destructive">{mensaje}</p>}
      <button
        onClick={() => setModo(modo === "entrar" ? "registrar" : "entrar")}
        className="mt-4 text-sm underline"
      >
        {modo === "entrar" ? "¿No tienes cuenta? Regístrate" : "Ya tengo cuenta"}
      </button>
    </main>
  );
}
