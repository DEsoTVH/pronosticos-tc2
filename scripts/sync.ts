// Uso:
//   npm run sync                 → actualiza resultados, horarios y fichas
//   npm run sync -- import 11955 → importa una cartelera de Boxerbook (id de evento)
import { createAdminClient } from "../src/lib/supabase/admin";
import { importEvent, syncAll } from "../src/lib/boxerbook/sync";

async function main() {
  const db = createAdminClient();
  const [cmd, arg] = process.argv.slice(2);

  if (cmd === "import") {
    if (!arg) throw new Error("Falta el id de evento: npm run sync -- import <id>");
    console.log(await importEvent(db, Number(arg)));
  } else {
    await syncAll(db);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
