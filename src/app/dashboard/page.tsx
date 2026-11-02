import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { BarList } from "@/components/bar-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DIVISIONS, WOMEN_DIVISIONS, divisionName, flag } from "@/lib/divisions";
import { PUBLISHER_LABELS, getDivisionRankings, getOverview, type RankedBoxer } from "@/lib/stats";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Dashboard</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Panorama de los boxeadores y los rankings por categoría.
      </p>
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Contenido({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const sp = await searchParams;
  const requested = first(sp.division);
  const division = [...DIVISIONS, ...WOMEN_DIVISIONS].some((d) => d.code === requested)
    ? requested
    : "hea";

  const [overview, rankings] = await Promise.all([getOverview(), getDivisionRankings(division)]);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Boxeadores" value={overview.total} />
        <Stat label="Campeones" value={overview.champions} hint="en algún organismo" />
        <Stat label="Divisiones" value={overview.byDivision.length} />
        <Stat label="Países" value={overview.countries} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Boxeadores por división</CardTitle>
            <CardDescription>De menor a mayor peso. Haz clic para ver el ranking.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              ariaLabel="Boxeadores por división"
              unit="boxeadores"
              items={overview.byDivision.map((d) => ({
                label: divisionName(d.code)!,
                value: d.count,
                href: `/dashboard?division=${d.code}`,
                active: d.code === division,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Países con más boxeadores</CardTitle>
            <CardDescription>Top 10.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              ariaLabel="Boxeadores por país"
              unit="boxeadores"
              items={overview.topCountries.map((c) => ({
                label: `${flag(c.code)} ${c.code}`,
                value: c.count,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Categoría: {divisionName(division)}</h2>
          <DivisionPicker active={division} />
        </div>
        <DivisionDetail rankings={rankings} />
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value.toLocaleString("es-CL")}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}

function DivisionPicker({ active }: { active: string }) {
  const group = (title: string, list: { code: string; name: string }[]) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-20 text-xs text-muted-foreground">{title}</span>
      {list.map((d) => (
        <Link
          key={d.code}
          href={`/dashboard?division=${d.code}`}
          className={
            "rounded-full border px-3 py-1 text-xs transition-colors " +
            (d.code === active
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:bg-muted")
          }
        >
          {d.name}
        </Link>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {group("Hombres", DIVISIONS)}
      {group("Mujeres", WOMEN_DIVISIONS)}
    </div>
  );
}

function record(b: RankedBoxer["boxers"]) {
  return b.wins == null ? "—" : `${b.wins}-${b.losses}-${b.draws}`;
}

function BoxerName({ b }: { b: RankedBoxer["boxers"] }) {
  const content = (
    <>
      <span className="mr-1.5">{flag(b.country)}</span>
      {b.name}
    </>
  );
  return b.boxerbook_slug ? (
    <a
      href={`https://boxerbook.com/boxers/${b.boxerbook_slug}`}
      className="font-medium hover:underline"
    >
      {content}
    </a>
  ) : (
    <span className="font-medium">{content}</span>
  );
}

function DivisionDetail({ rankings }: { rankings: RankedBoxer[] }) {
  if (!rankings.length) {
    return <p className="text-sm text-muted-foreground">Aún no hay rankings para esta categoría.</p>;
  }

  const top = rankings.filter((r) => r.publisher === "boxerbook").sort((a, b) => a.position - b.position);
  const champions = Object.keys(PUBLISHER_LABELS)
    .filter((p) => p !== "boxerbook")
    .map((p) => ({
      publisher: p,
      holders: rankings.filter((r) => r.publisher === p && r.position === 0),
    }))
    .filter((c) => c.holders.length);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Ranking Boxerbook</CardTitle>
          <CardDescription>Top 15 según el rating de Boxerbook.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Boxeador</TableHead>
                <TableHead>Récord</TableHead>
                <TableHead className="text-right">KOs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((r) => (
                <TableRow key={r.boxers.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{r.position}</TableCell>
                  <TableCell>
                    <BoxerName b={r.boxers} />
                  </TableCell>
                  <TableCell className="tabular-nums">{record(r.boxers)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.boxers.kos ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campeones</CardTitle>
          <CardDescription>Por organismo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {champions.length ? (
            champions.map((c) => (
              <div key={c.publisher}>
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  {PUBLISHER_LABELS[c.publisher]}
                </p>
                {c.holders.map((h) => (
                  <p key={h.boxers.id} className="flex items-center gap-2 text-sm">
                    <BoxerName b={h.boxers} />
                    {h.champion_flag && h.champion_flag !== "champion" && (
                      <Badge variant="secondary">{h.champion_flag}</Badge>
                    )}
                  </p>
                ))}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sin campeones registrados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
