"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const USERNAME = /^[a-z0-9_]{3,30}$/;

export async function guardarPerfil(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 40);

  if (!USERNAME.test(username)) {
    redirect("/perfil?error=" + encodeURIComponent("El usuario debe tener 3 a 30 caracteres: letras, números o _."));
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username, display_name: displayName || username })
    .eq("id", user.id);

  if (error) {
    const msg = error.code === "23505" ? "Ese nombre de usuario ya está en uso." : error.message;
    redirect("/perfil?error=" + encodeURIComponent(msg));
  }
  redirect("/perfil?ok=" + encodeURIComponent("Perfil actualizado."));
}
