-- =====================================================================
--  Pronósticos de boxeo del club — esquema para Supabase (PostgreSQL)
--  Datos de peleadores/peleas: Boxerbook (https://boxerbook.com), ODbL
-- =====================================================================
--  Cómo usarlo: Supabase → SQL Editor → pegar todo → Run.
--
--  Sistema de puntos (por pelea):
--    · Acertar ganador ..................... 3 pts
--    · + acertar método (KO/DEC/OTRO) ...... +1 pt  (solo si acertaste ganador)
--    · + acertar round (solo KO/TKO) ....... +1 pt  (solo si acertaste ganador y método KO)
--    · Acertar empate ...................... 5 pts
--    · Pelea cancelada / sin decisión (NC) . no cuenta (points = NULL)
--  Máximo por pelea: 5 pts.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type bout_side     as enum ('a', 'b');
create type bout_outcome  as enum ('a', 'b', 'draw', 'nc');          -- nc = no contest
create type pick_option   as enum ('a', 'b', 'draw');
create type method_group  as enum ('KO', 'DEC', 'OTRO');             -- KO = KO/TKO/RTD
create type event_status  as enum ('borrador', 'abierto', 'cerrado', 'finalizado');
create type bout_status   as enum ('programada', 'terminada', 'cancelada');


-- ---------------------------------------------------------------------
-- Perfiles de usuario (1 a 1 con auth.users de Supabase)
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique not null check (char_length(username) between 3 and 30),
  display_name  text,
  avatar_url    text,
  is_admin      boolean not null default false,
  is_bot        boolean not null default false,   -- el "bot" Boxerbook que compite en la tabla
  created_at    timestamptz not null default now()
);

-- Crea el perfil automáticamente cuando alguien se registra con su correo
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    -- username provisional: parte del correo + 4 caracteres del id (el usuario lo cambia después)
    left(split_part(new.email, '@', 1), 25) || '_' || left(new.id::text, 4),
    split_part(new.email, '@', 1)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: ¿el usuario actual es admin?
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;


-- ---------------------------------------------------------------------
-- Boxeadores (copia mínima desde Boxerbook, o creados a mano)
-- ---------------------------------------------------------------------
create table public.boxers (
  id               bigint generated always as identity primary key,
  boxerbook_id     bigint unique,                 -- null = boxeador agregado a mano
  boxerbook_slug   text,
  name             text not null,
  nickname         text,
  country          char(2),                       -- ISO 3166-1 alpha-2
  division         text,                          -- código Boxerbook: hea, smid, w_fea...
  wins             int,
  losses           int,
  draws            int,
  kos              int,
  stance           text,
  height_cm        int,
  reach_cm         int,
  synced_at        timestamptz,                   -- última vez que se actualizó desde Boxerbook
  created_at       timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- Eventos / carteleras (lo que se vota cada fin de semana)
-- ---------------------------------------------------------------------
create table public.events (
  id                  bigint generated always as identity primary key,
  boxerbook_event_id  bigint unique,
  name                text not null,              -- ej. "Canelo vs M'billi"
  event_date          date not null,
  start_utc           timestamptz,                -- inicio de la cartelera (Boxerbook lo da en UTC)
  voting_closes_at    timestamptz not null,       -- normalmente = start_utc
  venue               text,
  city                text,
  country             char(2),
  status              event_status not null default 'borrador',
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now()
);

create index events_date_idx on public.events (event_date desc);


-- ---------------------------------------------------------------------
-- Peleas dentro de un evento
-- ---------------------------------------------------------------------
create table public.bouts (
  id                  bigint generated always as identity primary key,
  event_id            bigint not null references public.events (id) on delete cascade,
  boxerbook_bout_id   bigint unique,
  boxer_a_id          bigint not null references public.boxers (id),
  boxer_b_id          bigint not null references public.boxers (id),
  display_order       bout_side[] not null default '{a,b}', -- en qué orden nombrarlos (Boxerbook "display")
  card_position       int not null default 0,     -- 0 = estelar; mayor = más abajo en la cartelera
  division            text,
  scheduled_rounds    int,
  title_text          text,                       -- ej. "WBC super middleweight title"
  -- resultado (lo llena la sincronización con Boxerbook)
  status              bout_status not null default 'programada',
  winner              bout_outcome,
  method              text,                       -- tal cual Boxerbook: KO, TKO, UD, SD, MD, RTD, DQ, TD...
  result_round        int,
  result_time         text,
  result_synced_at    timestamptz,
  -- pronóstico del modelo Boxerbook (para el bot)
  bb_forecast_p_a     numeric(5,4),               -- probabilidad de que gane el lado a
  created_at          timestamptz not null default now(),
  check (boxer_a_id <> boxer_b_id),
  check (status <> 'terminada' or winner is not null)
);

create index bouts_event_idx on public.bouts (event_id, card_position);


-- ---------------------------------------------------------------------
-- Pronósticos de los usuarios
-- ---------------------------------------------------------------------
create table public.predictions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  bout_id       bigint not null references public.bouts (id) on delete cascade,
  pick          pick_option not null,
  method_pick   method_group,                      -- opcional
  round_pick    int check (round_pick between 1 and 12),  -- opcional, solo tiene sentido con KO
  points        int,                               -- null = aún no se calcula / pelea no cuenta
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, bout_id),
  check (round_pick is null or method_pick = 'KO'),
  check (method_pick is null or pick <> 'draw')
);

create index predictions_bout_idx on public.predictions (bout_id);
create index predictions_user_idx on public.predictions (user_id);


-- ---------------------------------------------------------------------
-- Lógica de puntos
-- ---------------------------------------------------------------------

-- Traduce el método de Boxerbook a los 3 grupos que se votan
create or replace function public.method_to_group(m text)
returns method_group
language sql immutable
as $$
  select case
    when m is null                             then null
    when upper(m) in ('KO', 'TKO', 'RTD')      then 'KO'::method_group
    when upper(m) in ('UD', 'SD', 'MD', 'PTS') then 'DEC'::method_group
    else 'OTRO'::method_group                   -- DQ, TD, etc.
  end;
$$;

-- Puntos de un pronóstico dado el resultado
create or replace function public.calc_points(
  p_pick         pick_option,
  p_method_pick  method_group,
  p_round_pick   int,
  b_winner       bout_outcome,
  b_method       text,
  b_round        int
)
returns int
language plpgsql immutable
as $$
declare
  pts int := 0;
begin
  if b_winner is null or b_winner = 'nc' then
    return null;                                  -- no cuenta
  end if;

  if b_winner = 'draw' then
    return case when p_pick = 'draw' then 5 else 0 end;
  end if;

  if p_pick::text <> b_winner::text then
    return 0;                                     -- falló el ganador
  end if;

  pts := 3;                                       -- acertó ganador

  if p_method_pick is not null and p_method_pick = public.method_to_group(b_method) then
    pts := pts + 1;                               -- acertó método
    if p_method_pick = 'KO' and p_round_pick is not null and p_round_pick = b_round then
      pts := pts + 1;                             -- acertó round
    end if;
  end if;

  return pts;
end;
$$;

-- Recalcula los puntos de todos los pronósticos de una pelea
create or replace function public.score_bout(p_bout_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.predictions pr
  set points = case
                 when b.status = 'cancelada' then null
                 else public.calc_points(pr.pick, pr.method_pick, pr.round_pick,
                                         b.winner, b.method, b.result_round)
               end
  from public.bouts b
  where b.id = p_bout_id
    and pr.bout_id = b.id;
end;
$$;

-- Cada vez que cambia el resultado de una pelea, se recalculan sus puntos solos
create or replace function public.trg_bout_result_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.score_bout(new.id);
  return new;
end;
$$;

create trigger bout_result_changed
  after update of status, winner, method, result_round on public.bouts
  for each row
  when (old.status is distinct from new.status
        or old.winner is distinct from new.winner
        or old.method is distinct from new.method
        or old.result_round is distinct from new.result_round)
  execute function public.trg_bout_result_changed();

-- Mantiene updated_at y bloquea votos fuera de plazo (también para la API directa)
create or replace function public.trg_prediction_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  closes timestamptz;
  ev_status event_status;
begin
  select e.voting_closes_at, e.status into closes, ev_status
  from public.bouts b join public.events e on e.id = b.event_id
  where b.id = new.bout_id;

  -- el bot y los admins pueden escribir siempre; el resto solo con votación abierta
  if not exists (select 1 from public.profiles
                 where id = new.user_id and (is_bot or is_admin)) then
    if ev_status <> 'abierto' or now() >= closes then
      raise exception 'La votación de esta pelea está cerrada';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger prediction_guard
  before insert or update of pick, method_pick, round_pick on public.predictions
  for each row execute function public.trg_prediction_guard();


-- ---------------------------------------------------------------------
-- Tablas de posiciones
-- ---------------------------------------------------------------------

-- General (todo el historial)
create or replace view public.leaderboard
with (security_invoker = on)
as
select
  p.id                                         as user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.is_bot,
  coalesce(sum(pr.points), 0)                  as total_points,
  count(pr.points)                             as bouts_scored,
  count(*) filter (where pr.points > 0)        as correct_winners,
  round(100.0 * count(*) filter (where pr.points > 0)
        / nullif(count(pr.points), 0), 1)      as accuracy_pct
from public.profiles p
left join public.predictions pr on pr.user_id = p.id
group by p.id;

-- Por evento (el "ganador del fin de semana")
create or replace view public.event_leaderboard
with (security_invoker = on)
as
select
  b.event_id,
  pr.user_id,
  p.username,
  p.is_bot,
  coalesce(sum(pr.points), 0)                  as points,
  count(pr.points)                             as bouts_scored,
  count(*) filter (where pr.points > 0)        as correct_winners
from public.predictions pr
join public.bouts b    on b.id = pr.bout_id
join public.profiles p on p.id = pr.user_id
group by b.event_id, pr.user_id, p.username, p.is_bot;


-- ---------------------------------------------------------------------
-- Seguridad (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.boxers      enable row level security;
alter table public.events      enable row level security;
alter table public.bouts       enable row level security;
alter table public.predictions enable row level security;

-- Perfiles: todos los ven, cada uno edita el suyo
create policy "perfiles visibles"  on public.profiles for select using (true);
create policy "editar mi perfil"   on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- nadie puede hacerse admin/bot a sí mismo
revoke update on public.profiles from authenticated;
grant  update (username, display_name, avatar_url) on public.profiles to authenticated;

-- Boxeadores, eventos y peleas: lectura pública (menos borradores), escritura solo admin
create policy "boxeadores visibles" on public.boxers for select using (true);
create policy "admin boxeadores"    on public.boxers for all
  using (public.is_admin()) with check (public.is_admin());

create policy "eventos visibles" on public.events for select
  using (status <> 'borrador' or public.is_admin());
create policy "admin eventos"    on public.events for all
  using (public.is_admin()) with check (public.is_admin());

create policy "peleas visibles" on public.bouts for select
  using (exists (select 1 from public.events e
                 where e.id = event_id and (e.status <> 'borrador' or public.is_admin())));
create policy "admin peleas"    on public.bouts for all
  using (public.is_admin()) with check (public.is_admin());

-- Pronósticos:
--   · los míos los veo siempre
--   · los de otros solo cuando cerró la votación (para que nadie copie)
create policy "ver pronosticos" on public.predictions for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.bouts b join public.events e on e.id = b.event_id
               where b.id = bout_id and now() >= e.voting_closes_at)
  );
create policy "crear mi pronostico" on public.predictions for insert
  with check (user_id = auth.uid());
create policy "editar mi pronostico" on public.predictions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "borrar mi pronostico" on public.predictions for delete
  using (user_id = auth.uid()
         and exists (select 1 from public.bouts b join public.events e on e.id = b.event_id
                     where b.id = bout_id and e.status = 'abierto' and now() < e.voting_closes_at));

-- Los usuarios no pueden tocar la columna points
revoke insert, update on public.predictions from authenticated;
grant  insert (user_id, bout_id, pick, method_pick, round_pick) on public.predictions to authenticated;
grant  update (pick, method_pick, round_pick)                  on public.predictions to authenticated;

-- Las funciones de puntaje solo las corre el servidor (service_role / triggers)
revoke execute on function public.score_bout(bigint) from public, anon, authenticated;
