import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBout,
  getBoxer,
  getEvent,
  getRanking,
  PUBLISHERS,
  type BbBout,
  type BbSide,
} from "./client";
import { ALL_DIVISION_CODES } from "../divisions";

const BOXER_MAX_AGE_MS = 20 * 60 * 60 * 1000;
const BOXER_REFRESH_CAP = 40;

function boutStatus(b: BbBout): "programada" | "terminada" | "cancelada" {
  const s = b.status.toLowerCase();
  if (s.startsWith("cancel") || s.startsWith("postpon")) return "cancelada";
  if (s === "completed" && b.winner) return "terminada";
  return "programada";
}

// Devuelve el id local del peleador; lo crea si no existe.
async function ensureBoxer(db: SupabaseClient, side: BbSide): Promise<number> {
  if (side.id) {
    const { data, error } = await db
      .from("boxers")
      .upsert(
        { boxerbook_id: side.id, boxerbook_slug: side.slug, name: side.name },
        { onConflict: "boxerbook_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  // Sin id en Boxerbook: se reutiliza por nombre o se crea a mano.
  const { data: found } = await db
    .from("boxers")
    .select("id")
    .is("boxerbook_id", null)
    .eq("name", side.name)
    .maybeSingle();
  if (found) return found.id;
  const { data, error } = await db
    .from("boxers")
    .insert({ name: side.name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Importa una cartelera de Boxerbook (todas sus peleas, o solo las de `boutIds`). */
export async function importEvent(
  db: SupabaseClient,
  bbEventId: number,
  opts: { boutIds?: number[]; adminId?: string } = {},
) {
  const ev = await getEvent(bbEventId);
  const bouts = opts.boutIds
    ? ev.bouts.filter((b) => opts.boutIds!.includes(b.id))
    : ev.bouts;
  if (!bouts.length) throw new Error("La cartelera no tiene peleas para importar");

  // La hora de inicio de la cartelera viene en el detalle de una pelea (UTC).
  const first = await getBout(bouts[0].id);
  const startUtc = first.start_utc ? new Date(first.start_utc).toISOString() : null;
  const name = `${first.a.name} vs ${first.b.name}`;

  const { data: event, error } = await db
    .from("events")
    .upsert(
      {
        boxerbook_event_id: ev.id,
        name,
        event_date: ev.date,
        start_utc: startUtc,
        voting_closes_at: startUtc ?? `${ev.date}T00:00:00Z`,
        venue: ev.venue,
        city: ev.city,
        country: ev.country,
        created_by: opts.adminId,
      },
      { onConflict: "boxerbook_event_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;

  const eventId =
    event?.id ??
    (
      await db
        .from("events")
        .select("id")
        .eq("boxerbook_event_id", ev.id)
        .single()
    ).data!.id;

  for (const [i, b] of bouts.entries()) {
    const [aId, bId] = [await ensureBoxer(db, b.a), await ensureBoxer(db, b.b)];
    const { error: e } = await db.from("bouts").upsert(
      {
        event_id: eventId,
        boxerbook_bout_id: b.id,
        boxer_a_id: aId,
        boxer_b_id: bId,
        display_order: b.display,
        card_position: i,
        division: b.division,
        scheduled_rounds: b.scheduled_rounds,
        title_text: b.title_text,
        bb_forecast_p_a: b.forecast?.p_a ?? null,
      },
      { onConflict: "boxerbook_bout_id" },
    );
    if (e) throw e;
  }
  return { eventId, bouts: bouts.length };
}

/** Actualiza resultados, pronósticos, horarios y fichas de lo que ya está en la base. */
export async function syncAll(db: SupabaseClient, log: (m: string) => void = console.log) {
  const { data: events, error } = await db
    .from("events")
    .select("id, boxerbook_event_id, start_utc, voting_closes_at, status, bouts(id, boxerbook_bout_id, status)")
    .neq("status", "finalizado")
    .not("boxerbook_event_id", "is", null);
  if (error) throw error;

  for (const ev of events ?? []) {
    const bb = await getEvent(ev.boxerbook_event_id!);
    const local = new Map(ev.bouts.map((b) => [b.boxerbook_bout_id, b]));
    let pending = 0;

    for (const b of bb.bouts) {
      const row = local.get(b.id);
      if (!row) continue;
      const status = boutStatus(b);
      const { error: e } = await db
        .from("bouts")
        .update({
          status,
          winner: status === "terminada" ? b.winner : null,
          method: status === "terminada" ? (b.method ?? null) : null,
          result_round: status === "terminada" ? (b.round ?? null) : null,
          result_time: b.time ?? null,
          bb_forecast_p_a: b.forecast?.p_a ?? null,
          result_synced_at: new Date().toISOString(),
        })
        .eq("id", (row as { id: number }).id);
      if (e) throw e;
      if (status === "programada") pending++;
    }

    // ¿Cambió la hora de inicio? Si el cierre coincidía con ella, se mueve junto.
    const anyId = bb.bouts.find((b) => local.has(b.id))?.id;
    const patch: Record<string, unknown> = {};
    if (anyId && pending > 0) {
      const d = await getBout(anyId);
      const start = d.start_utc ? new Date(d.start_utc).toISOString() : null;
      const oldStart = ev.start_utc ? new Date(ev.start_utc).getTime() : null;
      if (start && new Date(start).getTime() !== oldStart) {
        patch.start_utc = start;
        if (new Date(ev.voting_closes_at).getTime() === oldStart) {
          patch.voting_closes_at = start;
        }
      }
    }
    if (pending === 0 && ev.bouts.length > 0) patch.status = "finalizado";
    if (Object.keys(patch).length) {
      const { error: e } = await db.from("events").update(patch).eq("id", ev.id);
      if (e) throw e;
    }
    log(`evento ${ev.boxerbook_event_id}: ${bb.bouts.length} peleas, ${pending} pendientes`);
  }

  await refreshBoxers(db, BOXER_REFRESH_CAP, log);
}

/** Actualiza las fichas desactualizadas (con tope por ejecución para cuidar el límite de la API). */
export async function refreshBoxers(
  db: SupabaseClient,
  cap: number,
  log: (m: string) => void = console.log,
) {
  const cutoff = new Date(Date.now() - BOXER_MAX_AGE_MS).toISOString();
  const { data: stale } = await db
    .from("boxers")
    .select("id, boxerbook_id")
    .not("boxerbook_id", "is", null)
    .or(`synced_at.is.null,synced_at.lt.${cutoff}`)
    .limit(cap);

  for (const bx of stale ?? []) {
    const c = await getBoxer(bx.boxerbook_id!);
    const { error: e } = await db
      .from("boxers")
      .update({
        name: c.name,
        boxerbook_slug: c.slug,
        nickname: c.nickname,
        country: c.country,
        sex: c.sex,
        division: c.division,
        wins: c.record?.w ?? null,
        losses: c.record?.l ?? null,
        draws: c.record?.d ?? null,
        kos: c.record?.ko ?? null,
        stance: c.stance,
        height_cm: c.height_cm == null ? null : Math.round(c.height_cm),
        reach_cm: c.reach_cm == null ? null : Math.round(c.reach_cm),
        synced_at: new Date().toISOString(),
      })
      .eq("id", bx.id);
    if (e) throw e;
  }
  log(`${stale?.length ?? 0} fichas de peleadores actualizadas`);
}

/** Trae los rankings (top 15 por división y organismo) y deja a esos boxeadores en la base. */
export async function syncRankings(db: SupabaseClient, log: (m: string) => void = console.log) {
  for (const division of ALL_DIVISION_CODES) {
    for (const publisher of PUBLISHERS) {
      const r = await getRanking(division, publisher);
      if (!r.items.length) continue;

      // Algunos puestos vienen sin id de Boxerbook: esos se resuelven por nombre.
      const linked = r.items.filter((i) => i.id);
      const { data: boxers, error } = linked.length
        ? await db
            .from("boxers")
            .upsert(
              linked.map((i) => ({ boxerbook_id: i.id, boxerbook_slug: i.slug, name: i.name })),
              { onConflict: "boxerbook_id" },
            )
            .select("id, boxerbook_id")
        : { data: [], error: null };
      if (error) throw error;
      const localId = new Map(boxers!.map((b) => [b.boxerbook_id, b.id]));

      const rows = [];
      for (const i of r.items) {
        const boxerId = i.id
          ? localId.get(i.id)
          : await ensureBoxer(db, { name: i.name, record: null });
        if (boxerId) rows.push({ ...i, boxerId });
      }

      // Se reemplaza la lista completa de ese organismo y división.
      const del = await db.from("rankings").delete().eq("publisher", publisher).eq("division", division);
      if (del.error) throw del.error;
      const { error: e } = await db.from("rankings").insert(
        rows.map((i) => ({
          publisher,
          division,
          position: i.position,
          boxer_id: i.boxerId,
          champion_flag: i.champion_flag ?? null,
          list_date: r.list_date,
        })),
      );
      if (e) throw e;
    }
    log(`ranking ${division} listo`);
  }
}
