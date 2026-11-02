"use client";

import { useEffect, useState } from "react";

/** Cuenta regresiva hasta el cierre de la votación. Se pinta solo en el navegador. */
export function Countdown({ closesAt }: { closesAt: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(new Date(closesAt).getTime() - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [closesAt]);

  if (left === null) return null;
  if (left <= 0) return <span>Votación cerrada</span>;

  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <span className="tabular-nums">
      Cierra en {d > 0 && `${d} d `}
      {h} h {m} min {d === 0 && h === 0 && `${s % 60} s`}
    </span>
  );
}
