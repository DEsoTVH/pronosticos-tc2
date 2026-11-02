import Link from "next/link";

export type BarItem = {
  label: string;
  value: number;
  href?: string;
  active?: boolean;
};

/**
 * Barras horizontales de un solo tono (magnitud). Se renderiza en el servidor,
 * sin JavaScript: el valor va impreso al final de la barra y también en el tooltip nativo.
 */
export function BarList({
  items,
  unit,
  ariaLabel,
}: {
  items: BarItem[];
  unit: string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-1.5 text-sm">
      {items.map((i) => {
        const label = (
          <span className={i.active ? "font-semibold text-foreground" : "text-foreground"}>
            {i.label}
          </span>
        );
        return (
          <li
            key={i.label}
            title={`${i.label}: ${i.value} ${unit}`}
            className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3"
          >
            {i.href ? (
              <Link href={i.href} className="truncate hover:underline">
                {label}
              </Link>
            ) : (
              <span className="truncate">{label}</span>
            )}
            <span className="h-2 rounded-r-sm bg-muted">
              <span
                className="block h-2 rounded-r-sm bg-chart-1"
                style={{ width: `${(i.value / max) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{i.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
