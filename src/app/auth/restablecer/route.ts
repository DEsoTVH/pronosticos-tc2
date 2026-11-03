import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino del enlace del correo de «olvidé mi contraseña»: abre una sesión temporal y lleva a elegir la nueva.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/restablecer", request.url));
  }
  return NextResponse.redirect(new URL("/login", request.url));
}
