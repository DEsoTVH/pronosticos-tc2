const SIZES = { sm: "size-9", md: "size-14" } as const;

/**
 * Foto del boxeador en un recuadro de tamaño fijo. Sin foto muestra una silueta genérica
 * con las mismas medidas, para que la lista se vea pareja.
 */
export function BoxerPhoto({
  url,
  name,
  size = "sm",
}: {
  url?: string | null;
  name: string;
  size?: keyof typeof SIZES;
}) {
  const box = `${SIZES[size]} shrink-0 overflow-hidden rounded-full border border-border bg-muted`;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} loading="lazy" className={`${box} object-cover object-top`} />;
  }
  return (
    <span className={`${box} inline-flex items-end justify-center`} role="img" aria-label={`Sin foto de ${name}`}>
      <svg viewBox="0 0 40 40" className="size-full text-muted-foreground/50" fill="currentColor" aria-hidden>
        <circle cx="20" cy="15" r="7" />
        <path d="M5 40c0-9 6.5-14 15-14s15 5 15 14z" />
      </svg>
    </span>
  );
}
