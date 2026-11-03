"use client";

import { useState } from "react";
import { BoxerPhoto } from "@/components/boxer-photo";

type Side = { key: "a" | "b"; name: string; detail: string; photo?: string | null };

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40";

/** Formulario de una pelea: ganador (o empate) y, opcionalmente, método y round. */
export function BoutPick({
  boutId,
  sides,
  rounds,
  initial,
}: {
  boutId: number;
  sides: [Side, Side]; // en el orden en que se muestran
  rounds: number;
  initial: { pick: string; method: string; round: number | null };
}) {
  const [pick, setPick] = useState(initial.pick);
  const [method, setMethod] = useState(initial.method);

  const option = (value: string, label: string, detail?: string, photo?: string | null, plain?: string) => (
    <label
      key={value}
      className={
        "flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm transition-colors " +
        (pick === value ? "border-primary bg-primary/10" : "hover:bg-muted")
      }
    >
      <span className="flex items-center gap-2 font-medium">
        <input
          type="radio"
          name={`pick_${boutId}`}
          value={value}
          checked={pick === value}
          onChange={() => {
            setPick(value);
            if (value === "draw") setMethod("");
          }}
        />
        {plain && <BoxerPhoto url={photo} name={plain} />}
        {label}
      </span>
      {detail && <span className="ml-6 text-xs text-muted-foreground">{detail}</span>}
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
        {option(sides[0].key, sides[0].name, sides[0].detail, sides[0].photo, sides[0].name)}
        {option("draw", "Empate")}
        {option(sides[1].key, sides[1].name, sides[1].detail, sides[1].photo, sides[1].name)}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Cómo gana
          <select
            name={`method_${boutId}`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            disabled={!pick || pick === "draw"}
            className={SELECT_CLASS}
          >
            <option value="">No sé (3 pts)</option>
            <option value="KO">KO / TKO (+1)</option>
            <option value="DEC">Decisión (+1)</option>
            <option value="OTRO">Otro: DQ, etc. (+1)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Round
          <select
            name={`round_${boutId}`}
            defaultValue={initial.round ?? ""}
            disabled={method !== "KO"}
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            {Array.from({ length: rounds }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">solo si es KO (+1)</span>
        </label>
        {pick && (
          <button
            type="button"
            onClick={() => {
              setPick("");
              setMethod("");
            }}
            className="text-xs text-muted-foreground underline"
          >
            Quitar mi voto
          </button>
        )}
      </div>
    </div>
  );
}
