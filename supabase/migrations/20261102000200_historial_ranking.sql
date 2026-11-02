-- Historial de rankings + protección de los votos.

-- 1) Los votos ya no se borran en cascada: un evento o pelea con votos no se puede eliminar.
--    (Un borrador sin votos sí se puede borrar; lo demás se archiva cambiando su estado.)
alter table public.bouts
  drop constraint bouts_event_id_fkey,
  add  constraint bouts_event_id_fkey
       foreign key (event_id) references public.events (id) on delete restrict;

alter table public.predictions
  drop constraint predictions_bout_id_fkey,
  add  constraint predictions_bout_id_fkey
       foreign key (bout_id) references public.bouts (id) on delete restrict;

-- 2) Historial: una foto de la tabla de posiciones al finalizar cada evento.
create table public.leaderboard_history (
  event_id         bigint not null references public.events (id) on delete restrict,
  user_id          uuid   not null references public.profiles (id) on delete cascade,
  event_points     int    not null,   -- puntos de este evento
  event_rank       int    not null,   -- posición dentro del evento
  total_points     int    not null,   -- acumulado hasta este evento (incluido)
  total_rank       int    not null,   -- posición acumulada tras este evento
  bouts_scored     int    not null,
  correct_winners  int    not null,
  created_at       timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index leaderboard_history_user_idx on public.leaderboard_history (user_id, event_id);

alter table public.leaderboard_history enable row level security;
create policy "historial visible" on public.leaderboard_history for select using (true);
-- Sin políticas de escritura: solo la escribe finalize_event_history (servidor).

-- Guarda (o rehace) la foto de un evento.
create or replace function public.finalize_event_history(p_event_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  ev_date date;
begin
  select event_date into ev_date from public.events where id = p_event_id;
  if ev_date is null then
    raise exception 'Evento % no existe', p_event_id;
  end if;

  delete from public.leaderboard_history where event_id = p_event_id;

  insert into public.leaderboard_history
    (event_id, user_id, event_points, event_rank, total_points, total_rank, bouts_scored, correct_winners)
  with ev as (
    select pr.user_id,
           coalesce(sum(pr.points), 0)               as pts,
           count(pr.points)                          as scored,
           count(*) filter (where pr.points > 0)     as correct
    from public.predictions pr
    join public.bouts b on b.id = pr.bout_id
    where b.event_id = p_event_id
    group by pr.user_id
  ),
  tot as (
    select pr.user_id,
           coalesce(sum(pr.points), 0)                                  as total,
           rank() over (order by coalesce(sum(pr.points), 0) desc)      as rk
    from public.predictions pr
    join public.bouts  b on b.id = pr.bout_id
    join public.events e on e.id = b.event_id
    where (e.event_date, e.id) <= (ev_date, p_event_id)
    group by pr.user_id
  )
  select p_event_id, ev.user_id, ev.pts,
         rank() over (order by ev.pts desc),
         tot.total, tot.rk, ev.scored, ev.correct
  from ev join tot using (user_id);
end;
$$;

revoke execute on function public.finalize_event_history(bigint) from public, anon, authenticated;
