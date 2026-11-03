"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarFotoBoxeador } from "@/app/admin/boxeadores/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const MAX_SIDE = 900; // px del lado mayor: de sobra para la ficha y el zoom

/** Reduce la imagen y la convierte a JPG; respeta la orientación de las fotos de celular. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.86),
  );
}

/** Sube la foto del boxeador a Storage (con la sesión del admin) y la registra en su ficha. */
export function PhotoUpload({ boxerId }: { boxerId: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const blob = await shrink(file);
        const supabase = createClient();
        const path = `${boxerId}-${Date.now()}.jpg`; // nombre nuevo cada vez: evita fotos viejas en caché
        const { error: upErr } = await supabase.storage
          .from("boxer-photos")
          .upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("boxer-photos").getPublicUrl(path);
        await guardarFotoBoxeador(boxerId, data.publicUrl);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir la foto");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept="image/*" onChange={onPick} hidden />
      <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Subiendo…" : "Subir foto"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
