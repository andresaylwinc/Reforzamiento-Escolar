-- =============================================================
--  Bitácoras: archivos adjuntos a cada clase
--  Ejecutar en SQL Editor si el esquema ya estaba creado.
--  (También viene incluido al final de 1-esquema.sql)
-- =============================================================

create table if not exists public.archivos (
  id          text primary key,
  clase_id    text not null references public.clases(id) on delete cascade,
  nombre      text not null,
  ruta        text not null,
  tipo        text default '',
  tamano      int default 0,
  subido_por  uuid references public.perfiles(id),
  creado_en   timestamptz not null default now()
);
create index if not exists archivos_clase_idx on public.archivos (clase_id);

alter table public.archivos enable row level security;

drop policy if exists archivos_lectura on public.archivos;
create policy archivos_lectura on public.archivos for select to authenticated
  using (exists (select 1 from public.clases c
                 where c.id = clase_id and public.puedo_ver_colegio(c.colegio_id)));

drop policy if exists archivos_escritura on public.archivos;
create policy archivos_escritura on public.archivos for all to authenticated
  using (exists (select 1 from public.clases c
                 where c.id = clase_id and public.puedo_ver_colegio(c.colegio_id)))
  with check (exists (select 1 from public.clases c
                 where c.id = clase_id and public.puedo_ver_colegio(c.colegio_id)));

-- -------------------------------------------------------------
-- Almacenamiento: carpeta privada "bitacoras"
-- Ruta: <colegio>/<curso>/<fecha>/<archivo>
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bitacoras', 'bitacoras', false)
on conflict (id) do nothing;

drop policy if exists "bitacoras leer" on storage.objects;
create policy "bitacoras leer" on storage.objects for select to authenticated
  using (bucket_id = 'bitacoras'
         and (storage.foldername(name))[1] in (select public.mis_colegios()));

drop policy if exists "bitacoras subir" on storage.objects;
create policy "bitacoras subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'bitacoras'
         and (storage.foldername(name))[1] in (select public.mis_colegios()));

drop policy if exists "bitacoras borrar" on storage.objects;
create policy "bitacoras borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'bitacoras'
         and (storage.foldername(name))[1] in (select public.mis_colegios()));
