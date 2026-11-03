"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ALL_DIVISION_CODES } from "@/lib/divisions";
import { importBoxer } from "@/lib/boxerbook/sync";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const boxrec = int(formData.get("boxrec_id"), 2_000_000_000);
  if (boxrec === undefined) return fail("El id de BoxRec debe ser un número");

  // Si viene de Boxerbook, el admin decide si sus correcciones se protegen de la sincronización.
  const linked = formData.get("linked") === "1";

  const row = {
    is_manual: true, // al guardar queda curado por el admin y se publica en la lista
    ...(linked ? { sync_locked: formData.get("mantener") === "on" } : {}),
    name,
    nickname: text(formData.get("nickname")),
    city: text(formData.get("city")),
    boxrec_id: boxrec,
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
    ? await supabase.from("boxers").update(row).eq("id", id)
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

// ---------------------------------------------------------------------
// Historial de peleas cargado a mano
// ---------------------------------------------------------------------
const METHODS = ["KO", "TKO", "RTD", "UD", "SD", "MD", "PTS", "DQ", "NC", "OTRO"];

export async function agregarPeleaHistorial(formData: FormData) {
  await requireAdmin();
  const boxerId = Number(formData.get("boxer"));
  const here = `${BACK}?editar=${boxerId}`;
  const fail = (m: string): never => redirect(`${here}&error=${msg(m)}`);

  const date = text(formData.get("fight_date"));
  if (!date || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(date)) return fail("La fecha va como 2026-08-08 (o solo el año)");
  const opponent = text(formData.get("opponent"));
  if (!opponent) return fail("Falta el nombre del rival");
  const result = text(formData.get("result"));
  if (!result || !["W", "L", "D", "NC"].includes(result)) return fail("Elige el resultado");
  const method = text(formData.get("method"));
  if (method && !METHODS.includes(method)) return fail("Método inválido");
  const round = int(formData.get("round"), 15);
  const scheduled = int(formData.get("scheduled"), 15);
  if (round === undefined || scheduled === undefined) return fail("Los rounds deben ser números");

  const supabase = await createClient();
  const { error } = await supabase.from("boxer_fights").insert({
    boxer_id: boxerId,
    fight_date: date,
    opponent_name: opponent,
    result,
    method,
    round,
    scheduled_rounds: scheduled,
    title_text: text(formData.get("title")),
    is_manual: true,
  });
  if (error) return fail(error.message);

  revalidatePath(`/boxeadores/${boxerId}`);
  redirect(`${here}&ok=${msg("Pelea agregada")}`);
}

export async function eliminarPeleaHistorial(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const boxerId = Number(formData.get("boxer"));
  const supabase = await createClient();
  const { error } = await supabase.from("boxer_fights").delete().eq("id", id).eq("is_manual", true);
  const here = `${BACK}?editar=${boxerId}`;
  if (error) redirect(`${here}&error=${msg(error.message)}`);
  revalidatePath(`/boxeadores/${boxerId}`);
  redirect(`${here}&ok=${msg("Pelea eliminada")}`);
}

// ---------------------------------------------------------------------
// Foto propia (el archivo lo sube el navegador a Storage; aquí solo se registra)
// ---------------------------------------------------------------------
export async function guardarFotoBoxeador(boxerId: number, url: string) {
  await requireAdmin();
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/boxer-photos/`;
  if (!url.startsWith(prefix)) throw new Error("URL de foto no válida");

  const supabase = await createClient();
  const { error } = await supabase
    .from("boxers")
    .update({
      photo_url: url,
      photo_manual: true,
      photo_author: "Foto propia",
      photo_license: "Foto del club",
      photo_page_url: null,
      photo_license_url: null,
    })
    .eq("id", boxerId);
  if (error) throw new Error(error.message);
  revalidatePath("/boxeadores");
  revalidatePath(`/boxeadores/${boxerId}`);
}

export async function quitarFotoBoxeador(formData: FormData) {
  await requireAdmin();
  const boxerId = Number(formData.get("id"));
  const supabase = await createClient();
  // photo_manual vuelve a false: la próxima búsqueda semanal puede ponerle una de Commons.
  const { error } = await supabase
    .from("boxers")
    .update({ photo_url: null, photo_manual: false, photo_author: null, photo_license: null, photo_checked_at: null })
    .eq("id", boxerId);
  const here = `${BACK}?editar=${boxerId}`;
  if (error) redirect(`${here}&error=${msg(error.message)}`);
  revalidatePath("/boxeadores");
  redirect(`${here}&ok=${msg("Foto quitada")}`);
}

// ---------------------------------------------------------------------
// Importar un boxeador que falta desde Boxerbook (ficha + historial)
// ---------------------------------------------------------------------
export async function importarBoxeadorDeBoxerbook(formData: FormData) {
  await requireAdmin();
  const bbId = Number(formData.get("bb"));
  const name = text(formData.get("name"));
  const q = text(formData.get("q")) ?? "";
  const back = `${BACK}?bq=${encodeURIComponent(q)}`;
  if (!bbId || !name) redirect(`${back}&error=${msg("Falta el boxeador")}`);

  let localId: number;
  try {
    localId = await importBoxer(createAdminClient(), bbId, name);
  } catch (e) {
    redirect(`${back}&error=${msg(e instanceof Error ? e.message : "No se pudo importar")}`);
  }
  revalidatePath("/boxeadores");
  redirect(`${BACK}?editar=${localId}&ok=${msg(`${name} importado con su historial`)}`);
}
