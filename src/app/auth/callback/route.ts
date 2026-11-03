import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace del correo de confirmación: cambia el código por una sesión y entra a la app.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  // Enlace vencido o ya usado: la cuenta puede estar confirmada igual, así que se manda a iniciar sesión.
  return NextResponse.redirect(new URL("/login", request.url));
}
