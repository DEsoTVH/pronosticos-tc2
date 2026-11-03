"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Botón de guardar: mientras el servidor trabaja se deshabilita y dice «Guardando…», para que se note que respondió. */
export function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Guardando…" : "Guardar mis pronósticos"}
    </Button>
  );
}
