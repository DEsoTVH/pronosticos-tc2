// Respaldo de nuestros datos de boxeo en archivos JSON.
//   npm run backup           → boxeadores, peleas, rankings, calendario y noticias (datos públicos)
//   npm run backup -- --todo → además eventos, votos y perfiles (privado: no subir a ningún sitio público)
// Escribe en backups/AAAA-MM-DD/ (carpeta ignorada por git).
import { mkdirSync, writeFileSync } from "node:fs";
import { createAdminClient } from "../src/lib/supabase/admin";

const PUBLICAS = ["boxers", "boxer_fights", "rankings", "upcoming_bouts", "news"];
const PRIVADAS = ["events", "bouts", "predictions", "profiles", "leaderboard_history"];

async function main() {
  const db = createAdminClient();
  const tablas = process.argv.includes("--todo") ? [...PUBLICAS, ...PRIVADAS] : PUBLICAS;
  const dir = `backups/${new Date().toISOString().slice(0, 10)}`;
  mkdirSync(dir, { recursive: true });

  for (const t of tablas) {
    const rows: unknown[] = [];
    // PostgREST entrega máx. 1000 filas por petición: se pagina.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select("*").range(from, from + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    writeFileSync(`${dir}/${t}.json`, JSON.stringify(rows));
    console.log(`${t}: ${rows.length} filas`);
  }
  console.log(`Respaldo guardado en ${dir}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
