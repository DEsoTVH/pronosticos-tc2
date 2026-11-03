import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBout,
  getBoxer,
  getBoxerBouts,
  getEvent,
  getRanking,
  getSchedule,
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
    // Solo inserta si no existe: no pisa lo que el admin haya corregido.
    const { error } = await db
      .from("boxers")
      .upsert(
        { boxerbook_id: side.id, boxerbook_slug: side.slug, name: side.name },
        { onConflict: "boxerbook_id", ignoreDuplicates: true },
      );
    if (error) throw error;
    const { data, error: e2 } = await db.from("boxers").select("id").eq("boxerbook_id", side.id).single();
    if (e2) throw e2;
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

export type ImportSource = {
  boxerbookEventId: number | null;
  date: string;
  startUtc?: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  bouts: BbBout[];
};

/** Crea (o reutiliza) el evento y guarda sus peleas. Sirve para carteleras con y sin id en Boxerbook. */
export async function importCard(
  db: SupabaseClient,
  src: ImportSource,
  opts: { adminId?: string } = {},
) {
  const bouts = src.bouts;
  if (!bouts.length) throw new Error("No hay peleas para importar");

  // ¿Ya existe el evento? Por id de Boxerbook o por alguna de sus peleas.
  let eventId: number | undefined;
  if (src.boxerbookEventId) {
    const { data } = await db
      .from("events")
      .select("id")
      .eq("boxerbook_event_id", src.boxerbookEventId)
      .maybeSingle();
    eventId = data?.id;
  }
  if (!eventId) {
    const { data } = await db
      .from("bouts")
      .select("event_id")
      .in("boxerbook_bout_id", bouts.map((b) => b.id))
      .limit(1)
      .maybeSingle();
    eventId = data?.event_id;
  }

  if (!eventId) {
    // La hora de inicio (UTC) viene en la cartelera, en una pelea, o en el detalle de una pelea.
    const startRaw =
      src.startUtc ?? bouts.find((b) => b.start_utc)?.start_utc ?? (await getBout(bouts[0].id)).start_utc;
    const startUtc = startRaw ? new Date(startRaw).toISOString() : null;
    const main = bouts.find((b) => b.title_text) ?? bouts[0];

    const { data, error } = await db
      .from("events")
      .insert({
        boxerbook_event_id: src.boxerbookEventId,
        name: `${main.a.name} vs ${main.b.name}`,
        event_date: src.date,
        start_utc: startUtc,
        voting_closes_at: startUtc ?? `${src.date}T00:00:00Z`,
        venue: src.venue,
        city: src.city,
        country: src.country,
        created_by: opts.adminId,
      })
      .select("id")
      .single();
    if (error) throw error;
    eventId = data.id;
  }

  const { count } = await db
    .from("bouts")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  for (const [i, b] of bouts.entries()) {
    const [aId, bId] = [await ensureBoxer(db, b.a), await ensureBoxer(db, b.b)];
    const { error: e } = await db.from("bouts").upsert(
      {
        event_id: eventId,
        boxerbook_bout_id: b.id,
        boxer_a_id: aId,
        boxer_b_id: bId,
        display_order: b.display,
        card_position: (count ?? 0) + i,
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

/** Importa una cartelera de Boxerbook por su id (todas sus peleas, o solo las de `boutIds`). */
export async function importEvent(
  db: SupabaseClient,
  bbEventId: number,
  opts: { boutIds?: number[]; adminId?: string } = {},
) {
  const ev = await getEvent(bbEventId);
  const bouts = opts.boutIds ? ev.bouts.filter((b) => opts.boutIds!.includes(b.id)) : ev.bouts;
  return importCard(
    db,
    {
      boxerbookEventId: ev.id,
      date: ev.date,
      venue: ev.venue,
      city: ev.city,
      country: ev.country,
      bouts,
    },
    { adminId: opts.adminId },
  );
}

/** Actualiza resultados, pronósticos, horarios y fichas de lo que ya está en la base. */
export async function syncAll(db: SupabaseClient, log: (m: string) => void = console.log) {
  const { data: events, error } = await db
    .from("events")
    .select("id, boxerbook_event_id, start_utc, voting_closes_at, status, bouts(id, boxerbook_bout_id, status)")
    .neq("status", "finalizado");
  if (error) throw error;

  for (const ev of events ?? []) {
    if (!ev.bouts.length) continue;
    const local = new Map(ev.bouts.map((b) => [b.boxerbook_bout_id, b]));

    // Con id de evento: 1 request. Sin id: 1 request por pelea.
    const bbBouts: BbBout[] = [];
    if (ev.boxerbook_event_id) bbBouts.push(...(await getEvent(ev.boxerbook_event_id)).bouts);
    else for (const b of ev.bouts) bbBouts.push(await getBout(b.boxerbook_bout_id));
    let pending = 0;

    for (const b of bbBouts) {
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
    const anyId = bbBouts.find((b) => local.has(b.id))?.id;
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
    // Los borradores no se finalizan solos: los maneja el admin.
    const finishes = pending === 0 && ev.status !== "borrador";
    if (finishes) patch.status = "finalizado";
    if (Object.keys(patch).length) {
      const { error: e } = await db.from("events").update(patch).eq("id", ev.id);
      if (e) throw e;
    }
    if (finishes) {
      const { error: e } = await db.rpc("finalize_event_history", { p_event_id: ev.id });
      if (e) throw e;
    }
    log(`evento ${ev.id}: ${bbBouts.length} peleas, ${pending} pendientes${finishes ? " → finalizado" : ""}`);
  }

  await refreshBoxers(db, BOXER_REFRESH_CAP, log);
}

/** Actualiza las fichas desactualizadas (con tope por ejecución para cuidar el límite de la API). */
/** Actualiza la ficha de un boxeador (por id local e id de Boxerbook) con los datos de Boxerbook. */
export async function refreshBoxer(db: SupabaseClient, localId: number, bbId: number) {
  const c = await getBoxer(bbId);
  const { error } = await db
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
    .eq("id", localId);
  if (error) throw error;
}

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
    .eq("sync_locked", false)
    .or(`synced_at.is.null,synced_at.lt.${cutoff}`)
    .limit(cap);

  for (const bx of stale ?? []) await refreshBoxer(db, bx.id, bx.boxerbook_id!);
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
      if (linked.length) {
        const { error: upErr } = await db.from("boxers").upsert(
          linked.map((i) => ({ boxerbook_id: i.id, boxerbook_slug: i.slug, name: i.name })),
          { onConflict: "boxerbook_id", ignoreDuplicates: true },
        );
        if (upErr) throw upErr;
      }
      const { data: boxers, error } = linked.length
        ? await db
            .from("boxers")
            .select("id, boxerbook_id")
            .in("boxerbook_id", linked.map((i) => i.id))
        : { data: [], error: null };
      if (error) throw error;
      const localId = new Map(boxers!.map((b) => [b.boxerbook_id, b.id]));

      const rows: ((typeof r.items)[number] & { boxerId: number })[] = [];
      for (const i of r.items) {
        const boxerId = i.id
          ? localId.get(i.id)
          : await ensureBoxer(db, { name: i.name, record: null });
        if (boxerId && !rows.some((x) => x.boxerId === boxerId)) rows.push({ ...i, boxerId });
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

/**
 * Guarda el calendario de los próximos 30 días en upcoming_bouts, para que la
 * página "Peleas" lea de nuestra base. Borra lo que Boxerbook ya no lista (peleas pasadas o canceladas).
 */
export async function syncSchedule(db: SupabaseClient) {
  const started = new Date().toISOString();
  const schedule = await getSchedule("30d");

  const rows = schedule.flatMap((ev) => {
    const key = ev.id ? `e${ev.id}` : `b${ev.bouts[0]?.id}`;
    return ev.bouts
      .filter((b) => b.status === "scheduled")
      .map((b) => ({
        boxerbook_bout_id: b.id,
        event_key: key,
        event_date: ev.date,
        start_utc: ev.start_utc ?? b.start_utc ?? null,
        venue: ev.venue,
        city: ev.city,
        country: ev.country,
        division: b.division ?? null,
        title_text: b.title_text ?? null,
        scheduled_rounds: b.scheduled_rounds ?? null,
        a_name: b.a.name,
        a_record: b.a.record,
        b_name: b.b.name,
        b_record: b.b.record,
        display_first: b.display?.[0] === "b" ? "b" : "a",
        p_a: b.forecast?.p_a ?? null,
        synced_at: started,
      }));
  });

  if (rows.length) {
    const { error } = await db.from("upcoming_bouts").upsert(rows, { onConflict: "boxerbook_bout_id" });
    if (error) throw error;
  }
  const { error: delErr } = await db.from("upcoming_bouts").delete().lt("synced_at", started);
  if (delErr) throw delErr;
  console.log(`Calendario: ${rows.length} peleas próximas.`);
}

const HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Baja el historial de peleas de un boxeador y lo guarda en boxer_fights. Devuelve cuántas peleas guardó. */
export async function syncBoxerHistory(db: SupabaseClient, localId: number, bbId: number) {
  const { bouts } = await getBoxerBouts(bbId);
  // Peleas de Boxerbook que el admin corrigió a mano (is_manual con id de Boxerbook): no se pisan.
  const { data: corrected } = await db
    .from("boxer_fights")
    .select("boxerbook_bout_id")
    .eq("boxer_id", localId)
    .eq("is_manual", true)
    .not("boxerbook_bout_id", "is", null);
  const keep = new Set((corrected ?? []).map((c) => c.boxerbook_bout_id as number));

  const rows = bouts
    .filter((b) => b.status === "completed" && !keep.has(b.id))
    .map((b) => ({
      boxer_id: localId,
      boxerbook_bout_id: b.id,
      fight_date: b.date,
      opponent_name: b.opponent.name,
      opponent_boxerbook_id: b.opponent.id ?? null,
      result: b.result,
      method: b.method,
      round: b.round,
      fight_time: b.time,
      scheduled_rounds: b.scheduled_rounds,
      title_text: b.title_text,
      exhibition: b.exhibition,
      record_before: b.record,
      opponent_record_before: b.opponent_record,
      boxerbook_url: b.url,
    }));

  if (rows.length) {
    const { error } = await db.from("boxer_fights").upsert(rows, { onConflict: "boxer_id,boxerbook_bout_id" });
    if (error) throw error;
  }
  // Si Boxerbook corrigió o quitó peleas, aquí también.
  const del = db.from("boxer_fights").delete().eq("boxer_id", localId).eq("is_manual", false);
  const { error: delErr } = rows.length
    ? await del.not("boxerbook_bout_id", "in", `(${rows.map((r) => r.boxerbook_bout_id).join(",")})`)
    : await del;
  if (delErr) throw delErr;

  await db.from("boxers").update({ history_synced_at: new Date().toISOString() }).eq("id", localId);
  return rows.length;
}

/**
 * Baja el historial de peleas de hasta `cap` boxeadores (primero los que nunca se bajaron,
 * luego los más antiguos) y lo guarda en boxer_fights. Solo peleas ya disputadas.
 */
export async function syncHistory(
  db: SupabaseClient,
  cap: number,
  log: (m: string) => void = console.log,
) {
  const cutoff = new Date(Date.now() - HISTORY_MAX_AGE_MS).toISOString();
  const { data: boxers } = await db
    .from("boxers")
    .select("id, boxerbook_id")
    .not("boxerbook_id", "is", null)
    .or(`history_synced_at.is.null,history_synced_at.lt.${cutoff}`)
    .order("history_synced_at", { ascending: true, nullsFirst: true })
    .limit(cap);

  let fights = 0;
  for (const [i, bx] of (boxers ?? []).entries()) {
    try {
      fights += await syncBoxerHistory(db, bx.id, bx.boxerbook_id!);
    } catch (e) {
      // Un boxeador con datos raros no debe frenar al resto: se salta y se reintenta en la próxima corrida.
      log(`Historial: error con el boxeador ${bx.id} (Boxerbook ${bx.boxerbook_id}): ${(e as Error).message}`);
    }
    if ((i + 1) % 25 === 0 || i + 1 === boxers!.length) log(`Historial: ${i + 1}/${boxers!.length} boxeadores, ${fights} peleas`);
  }
  if (!boxers?.length) log("Historial: nada pendiente.");
}

/** Trae un boxeador de Boxerbook (ficha e historial) aunque no estuviera en nuestra lista. Devuelve su id local. */
export async function importBoxer(db: SupabaseClient, bbId: number, name: string) {
  const { error } = await db
    .from("boxers")
    .upsert({ boxerbook_id: bbId, name }, { onConflict: "boxerbook_id", ignoreDuplicates: true });
  if (error) throw error;
  const { data, error: e2 } = await db.from("boxers").select("id").eq("boxerbook_id", bbId).single();
  if (e2) throw e2;
  await refreshBoxer(db, data.id, bbId);
  await syncBoxerHistory(db, data.id, bbId);
  return data.id as number;
}
