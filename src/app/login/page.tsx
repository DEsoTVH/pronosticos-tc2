"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

// Supabase responde en inglés: se traducen los casos que le pasan a la gente.
function traducir(msg: string) {
  if (/invalid login credentials/i.test(msg))
    return "Correo o contraseña incorrectos. Si olvidaste tu contraseña, usa «¿Olvidaste tu contraseña?».";
  if (/email not confirmed/i.test(msg)) return "Aún no confirmas tu correo: abre el enlace que te enviamos.";
  // Cuota de correos de todo el proyecto (no depende de quién intenta): el correo no salió.
  if (/email rate limit|over_email_send_rate_limit/i.test(msg))
    return "No pudimos enviarte el correo de confirmación porque la web alcanzó su límite de envíos por hora. No es culpa tuya: intenta de nuevo en una hora o avísale al administrador.";
  // Espera corta por repetir la misma solicitud muy seguido.
  if (/rate limit|too many|only request this after/i.test(msg)) return "Espera un minuto antes de volver a intentarlo.";
  return msg;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<"entrar" | "registrar">("entrar");
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setAviso(null);
    const supabase = createClient();

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAviso({ texto: traducir(error.message), error: true });
      else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setAviso({ texto: traducir(error.message), error: true });
      else if (data.user?.identities?.length === 0) {
        // Con el correo ya registrado Supabase no da error ni envía correo: se avisa aquí.
        setAviso({
          texto: "Ese correo ya tiene una cuenta. Entra con tu contraseña o usa «¿Olvidaste tu contraseña?».",
          error: true,
        });
      } else {
        setAviso({
          texto: "Listo. Revisa tu correo y abre el enlace una sola vez; si te dice que venció, entra con tu correo y contraseña.",
          error: false,
        });
      }
    }
    setCargando(false);
  }

  async function recuperar() {
    if (!email) return setAviso({ texto: "Escribe tu correo arriba y vuelve a pulsar.", error: true });
    setCargando(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/restablecer`,
    });
    setAviso(
      error
        ? { texto: traducir(error.message), error: true }
        : { texto: "Si ese correo tiene cuenta, te enviamos un enlace para crear una contraseña nueva.", error: false },
    );
    setCargando(false);
  }

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">{modo === "entrar" ? "Entrar" : "Crear cuenta"}</h1>
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
      {aviso && (
        <p className={`mt-3 text-sm ${aviso.error ? "text-destructive" : "text-muted-foreground"}`}>{aviso.texto}</p>
      )}
      <div className="mt-4 flex flex-col items-start gap-2 text-sm">
        <button type="button" onClick={() => setModo(modo === "entrar" ? "registrar" : "entrar")} className="underline">
          {modo === "entrar" ? "¿No tienes cuenta? Regístrate" : "Ya tengo cuenta"}
        </button>
        {modo === "entrar" && (
          <button type="button" onClick={recuperar} disabled={cargando} className="underline">
            ¿Olvidaste tu contraseña?
          </button>
        )}
      </div>
    </main>
  );
}
