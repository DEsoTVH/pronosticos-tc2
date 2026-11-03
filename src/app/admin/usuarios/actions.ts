"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BACK = "/admin/usuarios";
const ROLES = ["usuario", "miembro", "admin"];
const msg = (s: string) => encodeURIComponent(s);

/** Cambia el rol de un usuario. Solo un admin; no puede cambiar el suyo ni el del bot. */
export async function cambiarRol(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  const back = `${BACK}?${new URLSearchParams({ q: String(formData.get("q") ?? ""), r: String(formData.get("r") ?? "") })}`;
  const fail = (m: string): never => redirect(`${back}&error=${msg(m)}`);

  if (!ROLES.includes(role)) return fail("Rol inválido");
  if (id === me.id) return fail("No puedes cambiar tu propio rol (así nunca te quedas sin admin).");

  // La edición de roles va con la clave de servicio: los usuarios no tienen permiso sobre esa columna.
  const db = createAdminClient();
  const { data: target } = await db.from("profiles").select("username, is_bot").eq("id", id).maybeSingle();
  if (!target) return fail("No encontré a ese usuario");
  if (target.is_bot) return fail("El bot no tiene rol.");

  const { error } = await db.from("profiles").update({ role }).eq("id", id);
  if (error) return fail(error.message);

  revalidatePath(BACK);
  redirect(`${back}&ok=${msg(`${target.username} ahora es ${role}`)}`);
}
