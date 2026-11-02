// Boxerbook entrega horas en UTC; el club las ve en hora de Chile.
const TZ = "America/Santiago";

export function formatChile(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function parts(date: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** UTC → "YYYY-MM-DDTHH:mm" en hora de Chile (valor de un <input type="datetime-local">). */
export function utcToChileInput(iso: string) {
  const { y, m, d, h, mi } = parts(new Date(iso));
  const z = (n: number) => String(n).padStart(2, "0");
  return `${y}-${z(m)}-${z(d)}T${z(h)}:${z(mi)}`;
}

// Diferencia (ms) entre la hora de Chile y UTC en un instante dado.
function offsetMs(date: Date) {
  const { y, m, d, h, mi } = parts(date);
  const minute = Math.floor(date.getTime() / 60000) * 60000;
  return Date.UTC(y, m - 1, d, h, mi) - minute;
}

/** "YYYY-MM-DDTHH:mm" interpretado en hora de Chile → ISO en UTC (respeta el cambio de horario). */
export function chileInputToUtcIso(local: string) {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let utc = wall - offsetMs(new Date(wall));
  utc = wall - offsetMs(new Date(utc)); // reajuste si cruzó el cambio de horario
  return new Date(utc).toISOString();
}
