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

  const { data: bouts } = await supabase.from("bouts").select("id").eq("event_id", eventId);
  const { data: mine } = await supabase
    .from("predictions")
    .select("id, bout_id")
    .eq("user_id", user.id)
    .in("bout_id", bouts?.map((b) => b.id) ?? []);
  const existing = new Map(mine?.map((p) => [p.bout_id, p.id]));

  for (const { id } of bouts ?? []) {
    const pick = String(formData.get(`pick_${id}`) ?? "");
    const prev = existing.get(id);

    if (!["a", "b", "draw"].includes(pick)) {
      // Sin elección: si había voto, se borra.
      if (prev) await supabase.from("predictions").delete().eq("id", prev);
      continue;
    }

    // El método solo aplica si hay ganador; el round solo si el método es KO.
    const rawMethod = String(formData.get(`method_${id}`) ?? "");
    const method = pick !== "draw" && METHODS.includes(rawMethod) ? rawMethod : null;
    const round = Number(formData.get(`round_${id}`));
    const roundPick = method === "KO" && round >= 1 && round <= 12 ? round : null;

    const values = { pick, method_pick: method, round_pick: roundPick };
    const { error } = prev
      ? await supabase.from("predictions").update(values).eq("id", prev)
      : await supabase.from("predictions").insert({ ...values, user_id: user.id, bout_id: id });
    if (error) redirect(`${back}?error=${msg(error.message)}`);
  }

  revalidatePath(back);
  redirect(`${back}?ok=${msg("Pronósticos guardados")}`);
}
