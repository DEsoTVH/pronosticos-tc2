-- Roles: usuario (todo el que se registra), miembro (lo asigna el admin) y admin.
-- is_admin se mantiene sincronizado: las políticas de seguridad ya existentes dependen de él.
alter table public.profiles
  add column role text not null default 'usuario' check (role in ('usuario', 'miembro', 'admin'));

update public.profiles set role = 'admin' where is_admin;

create or replace function public.sync_profile_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin and new.role is not distinct from old.role then
    -- cambio directo de is_admin (por ejemplo desde el editor SQL): se refleja en el rol
    new.role := case when new.is_admin then 'admin' when old.role = 'admin' then 'usuario' else old.role end;
  else
    new.is_admin := (new.role = 'admin');
  end if;
  return new;
end;
$$;

create trigger profiles_sync_role
  before insert or update of role, is_admin on public.profiles
  for each row execute function public.sync_profile_role();

-- El rol solo lo cambia un admin (desde el panel, con la clave de servicio): los usuarios no tienen
-- permiso de edición sobre esta columna (solo username, display_name y avatar_url).
