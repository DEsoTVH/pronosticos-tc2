"use server";

import { revalidatePath } from "next/cache";
import { parseStream } from "@/lib/stream";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { eventKey, findCard, getScheduleCached } from "@/lib/boxerbook/schedule";
import { importCard } from "@/lib/boxerbook/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { chileInputToUtcIso } from "@/lib/time";

const STATUSES = ["borrador", "abierto", "cerrado", "finalizado"];
const msg = (s: string) => encodeURIComponent(s);

export async function importarCartelera(formData: FormData) {
  const user = await requireAdmin();
  const cuando = formData.get("cuando") === "30d" ? "30d" : "weekend";
  const back = `/admin/importar?cuando=${cuando}`;
  const key = String(formData.get("key"));
  const ids = formData.getAll("bout").map(Number).filter(Boolean);
  if (!ids.length) redirect(`${back}&error=${msg("Elige al menos una pelea")}`);

  const ev = (await getScheduleCached(cuando)).find((e) => eventKey(e) === key);
  if (!ev) redirect(`${back}&error=${msg("Esa cartelera ya no está en el calendario")}`);

  const { eventId } = await importCard(
    createAdminClient(),
    {
      boxerbookEventId: ev.id,
      date: ev.date,
      startUtc: ev.start_utc,
      venue: ev.venue,
      city: ev.city,
      country: ev.country,
      bouts: ev.bouts.filter((b) => ids.includes(b.id)),
    },
    { adminId: user.id },
  );
  revalidatePath("/admin");
  redirect(`/admin/eventos/${eventId}?ok=Cartelera importada como borrador`);
}

/** Suma más peleas de la misma cartelera de Boxerbook a un evento que ya existe. */
export async function agregarPeleas(formData: FormData) {
  const user = await requireAdmin();
  const id = Number(formData.get("id"));
  const back = `/admin/eventos/${id}`;
  const ids = formData.getAll("bout").map(Number).filter(Boolean);
  if (!ids.length) redirect(`${back}?error=${msg("Elige al menos una pelea")}`);

  const supabase = await createClient();
  const { data: ev } = await supabase
    .from("events")
    .select("boxerbook_event_id, bouts(boxerbook_bout_id)")
    .eq("id", id)
    .single();
  const local = ((ev?.bouts ?? []) as { boxerbook_bout_id: number | null }[]).flatMap((b) =>
    b.boxerbook_bout_id ? [b.boxerbook_bout_id] : [],
  );

  const card = await findCard(ev?.boxerbook_event_id ?? null, local);
  const bouts = card?.bouts.filter((b) => ids.includes(b.id) && !local.includes(b.id)) ?? [];
  if (!card || !bouts.length) redirect(`${back}?error=${msg("No encontré esas peleas en Boxerbook")}`);

  await importCard(
    createAdminClient(),
    {
      boxerbookEventId: card.id,
      date: card.date,
      startUtc: card.start_utc,
      venue: card.venue,
      city: card.city,
      country: card.country,
      bouts,
    },
    { adminId: user.id },
  );
  revalidatePath("/admin");
  redirect(`${back}?ok=${msg(`${bouts.length} pelea(s) agregada(s)`)}`);
}

export async function actualizarEvento(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const cierre = String(formData.get("cierre") ?? "");
  const status = String(formData.get("status"));
  const stream = String(formData.get("stream_url") ?? "").trim();
  const back = `/admin/eventos/${id}`;
  if (stream && !parseStream(stream)) {
    redirect(`${back}?error=${msg("El enlace de transmisión debe ser de YouTube o Twitch")}`);
  }
  if (!name || !cierre || !STATUSES.includes(status)) {
    redirect(`${back}?error=${msg("Revisa el nombre, la hora de cierre y el estado")}`);
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("events").select("status").eq("id", id).single();
  const { error } = await supabase
    .from("events")
    .update({ name, voting_closes_at: chileInputToUtcIso(cierre), status, stream_url: stream || null })
    .eq("id", id);
  if (error) redirect(`${back}?error=${msg(error.message)}`);

  // Al finalizar a mano también se guarda la foto del ranking.
  if (status === "finalizado" && before?.status !== "finalizado") {
    const { error: e } = await createAdminClient().rpc("finalize_event_history", { p_event_id: id });
    if (e) redirect(`${back}?error=${msg(e.message)}`);
  }
  revalidatePath("/admin");
  redirect(`${back}?ok=Cambios guardados`);
}

export async function eliminarPelea(formData: FormData) {
  await requireAdmin();
  const boutId = Number(formData.get("bout"));
  const eventId = Number(formData.get("event"));
  const supabase = await createClient();
  const { error } = await supabase.from("bouts").delete().eq("id", boutId);
  const back = `/admin/eventos/${eventId}`;
  if (error) redirect(`${back}?error=${msg("No se puede quitar: la pelea ya tiene votos")}`);
  redirect(`${back}?ok=Pelea quitada`);
}

export async function eliminarEvento(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events").select("status").eq("id", id).single();
  if (ev?.status !== "borrador") {
    redirect(`/admin/eventos/${id}?error=${msg("Solo se pueden eliminar borradores")}`);
  }
  const { error: e1 } = await supabase.from("bouts").delete().eq("event_id", id);
  const { error: e2 } = e1 ? { error: e1 } : await supabase.from("events").delete().eq("id", id);
  if (e2) redirect(`/admin/eventos/${id}?error=${msg("No se puede eliminar: tiene votos")}`);
  revalidatePath("/admin");
  redirect("/admin?ok=Evento eliminado");
}
