import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DIVISIONS, WOMEN_DIVISIONS, divisionName, flag } from "@/lib/divisions";

const PAGE_SIZE = 40;

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function BoxeadoresPage({ searchParams }: PageProps<"/boxeadores">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Boxeadores</h1>
      <Suspense fallback={<p className="text-zinc-500">Cargando…</p>}>
        <Listado searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Listado({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const division = first(sp.division);
  const country = first(sp.country).toUpperCase();
  const sex = first(sp.sex);
  const rankeados = first(sp.rankeados) === "1";
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const supabase = await createClient();

  // Solo boxeadores con ficha cargada; "rankeados" exige estar en algún ranking.
  let query = supabase
    .from("boxers")
    .select(
      `id, name, nickname, country, division, sex, wins, losses, draws, kos, stance, reach_cm, boxerbook_slug,
       rankings${rankeados ? "!inner" : ""}(publisher, position)`,
      { count: "exact" },
    )
    .not("synced_at", "is", null);

  if (q) query = query.ilike("name", `%${q.replace(/[%,]/g, " ")}%`);
  if (division) query = query.eq("division", division);
  if (country) query = query.eq("country", country);
  if (sex === "male" || sex === "female") query = query.eq("sex", sex);

  const { data: boxers, count } = await query
    .order("wins", { ascending: false, nullsFirst: false })
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (division) u.set("division", division);
    if (country) u.set("country", country);
    if (sex) u.set("sex", sex);
    if (rankeados) u.set("rankeados", "1");
    u.set("page", String(p));
    return `/boxeadores?${u}`;
  };

  return (
    <>
      <form className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre"
          className="rounded border border-zinc-300 bg-transparent px-3 py-2"
        />
        <select
          name="division"
          defaultValue={division}
          className="rounded border border-zinc-300 bg-transparent px-3 py-2"
        >
          <option value="">Todas las divisiones</option>
          <optgroup label="Masculinas">
            {DIVISIONS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Femeninas">
            {WOMEN_DIVISIONS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </optgroup>
        </select>
        <input
          name="country"
          defaultValue={country}
          maxLength={2}
          placeholder="País (CL, MX…)"
          className="w-28 rounded border border-zinc-300 bg-transparent px-3 py-2"
        />
        <select
          name="sex"
          defaultValue={sex}
          className="rounded border border-zinc-300 bg-transparent px-3 py-2"
        >
          <option value="">Ambos</option>
          <option value="male">Hombres</option>
          <option value="female">Mujeres</option>
        </select>
        <label className="flex items-center gap-2 py-2">
          <input type="checkbox" name="rankeados" value="1" defaultChecked={rankeados} />
          Solo rankeados
        </label>
        <button className="rounded bg-red-700 px-4 py-2 font-medium text-white">Filtrar</button>
      </form>

      <p className="mb-3 text-sm text-zinc-500">{count ?? 0} boxeadores</p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-300 text-zinc-500">
            <tr>
              <th className="py-2 pr-3">Boxeador</th>
              <th className="pr-3">División</th>
              <th className="pr-3">Récord (G-P-E)</th>
              <th className="pr-3">KOs</th>
              <th className="pr-3">Guardia</th>
              <th className="pr-3">Alcance</th>
              <th>Ranking</th>
            </tr>
          </thead>
          <tbody>
            {boxers?.map((b) => {
              const best = (b.rankings as { publisher: string; position: number }[] | null)
                ?.slice()
                .sort((x, y) => x.position - y.position)[0];
              return (
                <tr key={b.id} className="border-b border-zinc-200">
                  <td className="py-2 pr-3">
                    <span className="mr-1">{flag(b.country)}</span>
                    {b.boxerbook_slug ? (
                      <a
                        href={`https://boxerbook.com/boxers/${b.boxerbook_slug}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {b.name}
                      </a>
                    ) : (
                      <span className="font-medium">{b.name}</span>
                    )}
                    {b.nickname && <span className="ml-2 text-zinc-500">“{b.nickname}”</span>}
                  </td>
                  <td className="pr-3">{divisionName(b.division) ?? "—"}</td>
                  <td className="pr-3">
                    {b.wins == null ? "—" : `${b.wins}-${b.losses}-${b.draws}`}
                  </td>
                  <td className="pr-3">{b.kos ?? "—"}</td>
                  <td className="pr-3">{b.stance ?? "—"}</td>
                  <td className="pr-3">{b.reach_cm ? `${b.reach_cm} cm` : "—"}</td>
                  <td>
                    {best ? (best.position === 0 ? "Campeón" : `#${best.position}`) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!boxers?.length && (
          <p className="py-6 text-zinc-500">
            No hay boxeadores con esos filtros (o aún no se sincronizaron).
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 && <Link href={link(page - 1)}>← Anterior</Link>}
          <span className="text-zinc-500">
            Página {page} de {totalPages}
          </span>
          {page < totalPages && <Link href={link(page + 1)}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
