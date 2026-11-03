"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ALL_DIVISION_CODES } from "@/lib/divisions";
import { createClient } from "@/lib/supabase/server";

const BACK = "/admin/boxeadores";
const msg = (s: string) => encodeURIComponent(s);
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

// Entero opcional: vacío = null; inválido = undefined (error).
function int(v: FormDataEntryValue | null, max: number): number | null | undefined {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
}

export async function guardarBoxeador(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id")) || null;
  const here = id ? `${BACK}?editar=${id}` : BACK;
  const fail = (m: string): never =>
    redirect(`${here}${here.includes("?") ? "&" : "?"}error=${msg(m)}`);

  const name = text(formData.get("name"));
  if (!name) return fail("El nombre es obligatorio");

  const country = text(formData.get("country"))?.toUpperCase() ?? null;
  if (country && !/^[A-Z]{2}$/.test(country)) return fail("El país va con 2 letras (CL, MX, US…)");
  const sex = text(formData.get("sex"));
  if (sex && sex !== "male" && sex !== "female") return fail("Sexo inválido");
  const division = text(formData.get("division"));
  if (division && !ALL_DIVISION_CODES.includes(division)) return fail("División inválida");
  const stance = text(formData.get("stance"));
  if (stance && !["orthodox", "southpaw", "switch"].includes(stance)) return fail("Guardia inválida");

  const wins = int(formData.get("wins"), 500);
  const losses = int(formData.get("losses"), 500);
  const draws = int(formData.get("draws"), 500);
  const kos = int(formData.get("kos"), 500);
  const height = int(formData.get("height_cm"), 260);
  const reach = int(formData.get("reach_cm"), 260);
  if (
    wins === undefined ||
    losses === undefined ||
    draws === undefined ||
    kos === undefined ||
    height === undefined ||
    reach === undefined
  ) {
    return fail("Revisa los números: deben ser enteros sin signo");
  }
  if (kos != null && wins != null && kos > wins) return fail("Los KOs no pueden superar las victorias");

  const row = {
    is_manual: true, // al guardar, pasa a ser del club y se publica
    name,
    nickname: text(formData.get("nickname")),
    country,
    sex,
    division,
    stance,
    wins,
    losses,
    draws,
    kos,
    height_cm: height,
    reach_cm: reach,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("boxers").update(row).eq("id", id).is("boxerbook_id", null)
    : await supabase.from("boxers").insert(row);
  if (error) return fail(error.message);

  revalidatePath("/boxeadores");
  redirect(`${BACK}?ok=${msg(id ? "Boxeador actualizado" : "Boxeador creado")}`);
}

export async function eliminarBoxeador(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("boxers").delete().eq("id", id).is("boxerbook_id", null);
  if (error) redirect(`${BACK}?error=${msg("No se puede eliminar: tiene peleas asociadas")}`);
  revalidatePath("/boxeadores");
  redirect(`${BACK}?ok=${msg("Boxeador eliminado")}`);
}
