// Uso:
//   npm run sync                   → actualiza resultados, horarios y fichas
//   npm run sync -- import 11955   → importa una cartelera de Boxerbook (id de evento)
//   npm run sync -- rankings       → trae los rankings (≈250 requests, ~5 min; semanal)
//   npm run sync -- fichas [n]     → actualiza hasta n fichas de boxeadores (por defecto 300)
//   npm run sync -- bot            → el bot vota el favorito de Boxerbook en las peleas abiertas
//   npm run sync -- historial [n]  → baja el historial de peleas de hasta n boxeadores (~1,2 s c/u)
//   npm run sync -- fotos [n]      → busca fotos (Wikimedia Commons) de hasta n boxeadores
//   npm run sync -- calendario     → guarda las próximas peleas (30 días) para la página Peleas
import { createAdminClient } from "../src/lib/supabase/admin";
import { runBot } from "../src/lib/bot";
import { syncPhotos } from "../src/lib/photos";
import { importEvent, refreshBoxers, syncAll, syncHistory, syncRankings, syncSchedule } from "../src/lib/boxerbook/sync";

async function main() {
  const db = createAdminClient();
  const [cmd, arg] = process.argv.slice(2);

  if (cmd === "import") {
    if (!arg) throw new Error("Falta el id de evento: npm run sync -- import <id>");
    console.log(await importEvent(db, Number(arg)));
  } else if (cmd === "rankings") {
    await syncRankings(db);
  } else if (cmd === "calendario") {
    await syncSchedule(db);
  } else if (cmd === "fotos") {
    await syncPhotos(db, Number(arg ?? 500));
  } else if (cmd === "historial") {
    await syncHistory(db, Number(arg ?? 100));
  } else if (cmd === "bot") {
    await runBot(db);
  } else if (cmd === "fichas") {
    await refreshBoxers(db, Number(arg ?? 300));
  } else {
    await syncSchedule(db);
    await syncAll(db);
    await runBot(db);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
