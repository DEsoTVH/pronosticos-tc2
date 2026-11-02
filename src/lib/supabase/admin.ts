import { createClient } from "@supabase/supabase-js";

// Cliente con service_role: se salta RLS. Solo para código de servidor
// (sincronización con Boxerbook, bot). Nunca importarlo desde un componente cliente.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
