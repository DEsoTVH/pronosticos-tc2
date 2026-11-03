-- Titulares de noticias de boxeo (RSS). Solo se guarda titular, fuente y enlace a la nota original.
create table public.news (
  id            bigint generated always as identity primary key,
  url           text not null unique,
  title         text not null,
  source        text not null,                 -- medio (RedGol, ESPN…)
  lang          text not null check (lang in ('es', 'en')),
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now()
);

create index news_published_idx on public.news (published_at desc);

alter table public.news enable row level security;
create policy "noticias visibles" on public.news for select using (true);
