export type FormFight = {
  result: "W" | "L" | "D" | "NC" | null;
  opponent_name: string;
  method: string | null;
  round: number | null;
  fight_date: string;
};

const DOT: Record<string, string> = {
  W: "bg-emerald-500",
  L: "bg-red-500",
  D: "bg-white",
};

/** Resultado de las últimas peleas, la más reciente a la izquierda: verde gana, rojo pierde, blanco empata. */
export function FormDots({ fights }: { fights: FormFight[] }) {
  if (!fights.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {fights.map((f, i) => (
        <span
          key={i}
          title={`${f.fight_date} · ${f.result ?? "sin resultado"} vs ${f.opponent_name}${
            f.method ? ` · ${f.method}${f.round ? ` r${f.round}` : ""}` : ""
          }`}
          className={`size-3 rounded-full ${DOT[f.result ?? ""] ?? "border border-muted-foreground/60"}`}
        />
      ))}
    </span>
  );
}
