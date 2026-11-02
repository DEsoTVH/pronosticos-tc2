import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const BOT_EMAIL = "bot@pronosticos-tc2.invalid";

// Crea (una sola vez) el usuario del bot y lo marca como is_bot. Devuelve su id.
async function ensureBot(db: SupabaseClient): Promise<string> {
  const { data: existing } = await db.from("profiles").select("id").eq("is_bot", true).limit(1);
  if (existing?.length) return existing[0].id;

  const { data, error } = await db.auth.admin.createUser({
    email: BOT_EMAIL,
    password: randomBytes(24).toString("hex"), // nadie inicia sesión como el bot
    email_confirm: true,
  });
  if (error) throw error;

  const { error: upErr } = await db
    .from("profiles")
    .update({ is_bot: true, username: "boxerbook_bot", display_name: "Bot Boxerbook" })
    .eq("id", data.user.id);
  if (upErr) throw upErr;
  return data.user.id;
}

/**
 * El bot vota el favorito del modelo de Boxerbook (solo ganador) en las peleas
 * de eventos con votación abierta que aún no votó. Sirve de vara para medir al club.
 */
export async function runBot(db: SupabaseClient) {
  const botId = await ensureBot(db);

  const { data: events, error } = await db
    .from("events")
    .select("id, bouts(id, bb_forecast_p_a, status)")
    .eq("status", "abierto")
    .gt("voting_closes_at", new Date().toISOString());
  if (error) throw error;

  const bouts = (events ?? []).flatMap((e) =>
    (e.bouts as { id: number; bb_forecast_p_a: number | null; status: string }[]).filter(
      (b) => b.status === "programada" && b.bb_forecast_p_a != null && b.bb_forecast_p_a !== 0.5,
    ),
  );
  if (!bouts.length) return console.log("Bot: nada que votar.");

  const { data: done } = await db
    .from("predictions")
    .select("bout_id")
    .eq("user_id", botId)
    .in("bout_id", bouts.map((b) => b.id));
  const voted = new Set(done?.map((d) => d.bout_id));

  const rows = bouts
    .filter((b) => !voted.has(b.id))
    .map((b) => ({ user_id: botId, bout_id: b.id, pick: b.bb_forecast_p_a! > 0.5 ? "a" : "b" }));
  if (rows.length) {
    const { error: insErr } = await db.from("predictions").insert(rows);
    if (insErr) throw insErr;
  }
  console.log(`Bot: ${rows.length} votos nuevos.`);
}
