"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

const METHODS = ["KO", "DEC", "OTRO"];
const msg = (s: string) => encodeURIComponent(s);

/** Guarda (crea, cambia o borra) los pronósticos del usuario para todas las peleas de un evento. */
export async function guardarPronosticos(formData: FormData) {
  await connection();
  const eventId = Number(formData.get("event"));
  const back = `/eventos/${eventId}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Peleas del evento y mis votos actuales, en paralelo (una sola ida a la base cada uno).
  const [{ data: bouts }, { data: mine }] = await Promise.all([
    supabase.from("bouts").select("id").eq("event_id", eventId),
    supabase.from("predictions").select("id, bout_id, bouts!inner(event_id)").eq("user_id", user.id).eq("bouts.event_id", eventId),
  ]);
  const existing = new Map(mine?.map((p) => [p.bout_id as number, p.id as number]));

  const toDelete: number[] = [];
  const toInsert: { pick: string; method_pick: string | null; round_pick: number | null; user_id: string; bout_id: number }[] = [];
  const toUpdate: { id: number; values: { pick: string; method_pick: string | null; round_pick: number | null } }[] = [];

  for (const { id } of bouts ?? []) {
    const pick = String(formData.get(`pick_${id}`) ?? "");
    const prev = existing.get(id);

    if (!["a", "b", "draw"].includes(pick)) {
      // Sin elección: si había voto, se borra.
      if (prev) toDelete.push(prev);
      continue;
    }

    // El método solo aplica si hay ganador; el round solo si el método es KO.
    const rawMethod = String(formData.get(`method_${id}`) ?? "");
    const method = pick !== "draw" && METHODS.includes(rawMethod) ? rawMethod : null;
    const round = Number(formData.get(`round_${id}`));
    const roundPick = method === "KO" && round >= 1 && round <= 12 ? round : null;

    const values = { pick, method_pick: method, round_pick: roundPick };
    if (prev) toUpdate.push({ id: prev, values });
    else toInsert.push({ ...values, user_id: user.id, bout_id: id });
  }

  // Todo junto: un borrado, una inserción y las actualizaciones en paralelo.
  const results = await Promise.all([
    toDelete.length ? supabase.from("predictions").delete().in("id", toDelete) : null,
    toInsert.length ? supabase.from("predictions").insert(toInsert) : null,
    ...toUpdate.map((u) => supabase.from("predictions").update(u.values).eq("id", u.id)),
  ]);
  const failed = results.find((r) => r?.error);
  if (failed?.error) redirect(`${back}?error=${msg(failed.error.message)}`);

  revalidatePath(back);
  redirect(`${back}?ok=${msg("Pronósticos guardados")}`);
}
