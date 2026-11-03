import { cacheLife } from "next/cache";
import { getEvent, getSchedule, type BbScheduleEvent } from "./client";

/** Calendario de Boxerbook cacheado unas horas: el panel de admin no pega a la API en cada visita. */
export async function getScheduleCached(when: "weekend" | "30d") {
  "use cache";
  cacheLife("hours");
  return getSchedule(when);
}

// Algunas carteleras no tienen id en Boxerbook: se identifican por su primera pelea.
export const eventKey = (ev: BbScheduleEvent) =>
  ev.id ? `e${ev.id}` : `b${ev.bouts[0]?.id}`;

/**
 * Cartelera de Boxerbook a la que pertenece un evento del club: por su id o por alguna de
 * sus peleas (hay carteleras sin id). Primero el calendario cacheado; si no está, el detalle del evento.
 */
export async function findCard(
  bbEventId: number | null,
  boutIds: number[],
): Promise<BbScheduleEvent | null> {
  const hit = (await getScheduleCached("30d")).find(
    (e) => (bbEventId && e.id === bbEventId) || e.bouts.some((b) => boutIds.includes(b.id)),
  );
  if (hit) return hit;
  return bbEventId ? getEvent(bbEventId) : null;
}
