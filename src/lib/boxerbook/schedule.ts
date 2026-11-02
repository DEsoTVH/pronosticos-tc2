import { cacheLife } from "next/cache";
import { getSchedule, type BbScheduleEvent } from "./client";

/** Calendario de Boxerbook cacheado unas horas: el panel de admin no pega a la API en cada visita. */
export async function getScheduleCached(when: "weekend" | "30d") {
  "use cache";
  cacheLife("hours");
  return getSchedule(when);
}

// Algunas carteleras no tienen id en Boxerbook: se identifican por su primera pelea.
export const eventKey = (ev: BbScheduleEvent) =>
  ev.id ? `e${ev.id}` : `b${ev.bouts[0]?.id}`;
