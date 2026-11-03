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
    .update({ is_bot: true, username: "bot_tc2", display_name: "Bot TC2 (por récord)" })
    .eq("id", data.user.id);
  if (upErr) throw upErr;
  return data.user.id;
}

type Rec = { wins: number | null; losses: number | null; draws: number | null };

/**
 * Porcentaje de victorias con corrección por cantidad de peleas: (G+1)/(N+2).
 * Así un 3-0 (0,80) no supera a un 40-2 (0,93). Devuelve null si no hay récord.
 */
function strength(r: Rec | null) {
  if (!r || r.wins == null) return null;
  const n = r.wins + (r.losses ?? 0) + (r.draws ?? 0);
  return (r.wins + 1) / (n + 2);
}

/**
 * El bot vota (solo ganador) al boxeador con mejor récord en las peleas de eventos con
 * votación abierta que aún no votó. Usa solo datos públicos de los boxeadores; sirve de vara para medir al club.
 */
export async function runBot(db: SupabaseClient) {
  const botId = await ensureBot(db);

  const { data: events, error } = await db
    .from("events")
    .select(
      `id, bouts(id, status,
         a:boxers!boxer_a_id(wins, losses, draws),
         b:boxers!boxer_b_id(wins, losses, draws))`,
    )
    .eq("status", "abierto")
    .gt("voting_closes_at", new Date().toISOString());
  if (error) throw error;

  type Bout = { id: number; status: string; a: Rec | null; b: Rec | null };
  const picks = (events ?? [])
    .flatMap((e) => e.bouts as unknown as Bout[])
    .filter((b) => b.status === "programada")
    .map((b) => {
      const [sa, sb] = [strength(b.a), strength(b.b)];
      // Sin récord de alguno, o igualados: no hay favorito claro y el bot no vota.
      return sa == null || sb == null || sa === sb ? null : { bout: b.id, pick: sa > sb ? "a" : "b" };
    })
    .filter((p): p is { bout: number; pick: string } => p !== null);
  if (!picks.length) return console.log("Bot: nada que votar.");

  const { data: done } = await db
    .from("predictions")
    .select("bout_id")
    .eq("user_id", botId)
    .in("bout_id", picks.map((p) => p.bout));
  const voted = new Set(done?.map((d) => d.bout_id));

  const rows = picks
    .filter((p) => !voted.has(p.bout))
    .map((p) => ({ user_id: botId, bout_id: p.bout, pick: p.pick }));
  if (rows.length) {
    const { error: insErr } = await db.from("predictions").insert(rows);
    if (insErr) throw insErr;
  }
  console.log(`Bot: ${rows.length} votos nuevos.`);
}
