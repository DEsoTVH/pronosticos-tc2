"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

const SIZES = { sm: "size-9", md: "size-14", lg: "size-28" } as const;
const ZOOM_W = 240;
const ZOOM_H = 300;

/**
 * Foto del boxeador en un recuadro de tamaño fijo. Sin foto muestra una silueta genérica
 * con las mismas medidas, para que la lista se vea pareja. Al pasar el puntero, la foto se agranda.
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
  const [zoom, setZoom] = useState<{ left: number; top: number } | null>(null);
  const box = `${SIZES[size]} shrink-0 overflow-hidden rounded-full border border-border bg-muted`;

  if (!url) {
    return (
      <span className={`${box} inline-flex items-end justify-center`} role="img" aria-label={`Sin foto de ${name}`}>
        <svg viewBox="0 0 40 40" className="size-full text-muted-foreground/50" fill="currentColor" aria-hidden>
          <circle cx="20" cy="15" r="7" />
          <path d="M5 40c0-9 6.5-14 15-14s15 5 15 14z" />
        </svg>
      </span>
    );
  }

  // El agrandado va fijo sobre la pantalla (no dentro de la tarjeta, que recortaría): a la derecha de la foto, o a la izquierda si no cabe.
  function open(e: React.MouseEvent<HTMLImageElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const left = r.right + 12 + ZOOM_W <= window.innerWidth ? r.right + 12 : Math.max(8, r.left - 12 - ZOOM_W);
    const top = Math.min(Math.max(8, r.top + r.height / 2 - ZOOM_H / 2), window.innerHeight - ZOOM_H - 8);
    setZoom({ left, top });
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        loading="lazy"
        onMouseEnter={open}
        onMouseLeave={() => setZoom(null)}
        className={`${box} cursor-zoom-in object-cover object-top`}
      />
      {zoom &&
        createPortal(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            style={{ left: zoom.left, top: zoom.top, width: ZOOM_W, height: ZOOM_H }}
            className="pointer-events-none fixed z-50 rounded-xl border border-primary/40 bg-card object-cover object-top shadow-2xl"
          />,
          document.body,
        )}
    </>
  );
}
