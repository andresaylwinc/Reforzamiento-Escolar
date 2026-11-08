-- =============================================================
--  Sistema de reforzamiento — esquema para Supabase (PostgreSQL)
--  Ejecutar completo en: Supabase → SQL Editor → New query → Run
--  Es idempotente en lo posible: se puede volver a correr.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Perfiles: un registro por persona con cuenta en el sistema
-- ---------------------------------------------------------------
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         text not null default 'profesor' check (rol in ('lider', 'profesor')),
  activo      boolean not null default true,
  creado      timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 2. Estructura del proyecto
-- ---------------------------------------------------------------
create table if not exists public.colegios (
  id          text primary key,
  nombre      text not null,
  comuna      text default '',
  color       text default '#1F3B57',
  creado      timestamptz not null default now()
);

create table if not exists public.cursos (
  id          text primary key,
  colegio_id  text not null references public.colegios(id) on delete cascade,
  nombre      text not null,
  creado      timestamptz not null default now()
);

-- Qué profesor hace clases en qué colegio
create table if not exists public.asignaciones (
  colegio_id  text not null references public.colegios(id) on delete cascade,
  profesor_id uuid not null references public.perfiles(id) on delete cascade,
  primary key (colegio_id, profesor_id)
);

create table if not exists public.estudiantes (
  id          text primary key,
  colegio_id  text not null references public.colegios(id) on delete cascade,
  curso_id    text not null references public.cursos(id) on delete cascade,
  nombre      text not null,
  activo      boolean not null default true,
  creado      timestamptz not null default now()
);
create index if not exists estudiantes_curso_idx on public.estudiantes (curso_id);

-- ---------------------------------------------------------------
-- 3. Registro de clases
--    Una sola clase por curso y fecha (clave única)
-- ---------------------------------------------------------------
create table if not exists public.clases (
  id            text primary key,
  fecha         date not null,
  colegio_id    text not null references public.colegios(id),
  curso_id      text not null references public.cursos(id),
  profesor_id   uuid not null references public.perfiles(id),
  realizada     boolean not null default true,
  motivo        text default '',
  registrado_por uuid references public.perfiles(id),
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (curso_id, fecha)
);
create index if not exists clases_fecha_idx on public.clases (fecha);
create index if not exists clases_colegio_idx on public.clases (colegio_id);

-- Evaluación: 0 = sin nota; 1, 2 y 3 = niveles de logro.
-- Asistencia: P = presente, A = ausente.
create table if not exists public.registros (
  id            text primary key,
  clase_id      text not null references public.clases(id) on delete cascade,
  estudiante_id text not null references public.estudiantes(id) on delete cascade,
  asistencia    char(1) not null check (asistencia in ('P', 'A')),
  evaluacion    int not null check (evaluacion between 0 and 3),
  observacion   text default '',
  etiquetas     text[] not null default '{}',
  actualizado_en timestamptz not null default now(),
  unique (clase_id, estudiante_id)
);
create index if not exists registros_clase_idx on public.registros (clase_id);
create index if not exists registros_estudiante_idx on public.registros (estudiante_id);

-- ---------------------------------------------------------------
-- 4. Funciones auxiliares para las reglas de acceso
-- ---------------------------------------------------------------
create or replace function public.es_lider()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'lider' and activo
  );
$$;

create or replace function public.mis_colegios()
returns setof text language sql stable security definer set search_path = public as $$
  select colegio_id from public.asignaciones where profesor_id = auth.uid();
$$;

create or replace function public.puedo_ver_colegio(c text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_lider() or c in (select public.mis_colegios());
$$;

-- ---------------------------------------------------------------
-- 5. Reglas de acceso por fila (RLS)
-- ---------------------------------------------------------------
alter table public.perfiles     enable row level security;
alter table public.colegios     enable row level security;
alter table public.cursos       enable row level security;
alter table public.asignaciones enable row level security;
alter table public.estudiantes  enable row level security;
alter table public.clases       enable row level security;
alter table public.registros    enable row level security;

-- Perfiles: cada uno se ve a sí mismo; la líder ve a todos y puede editarlos
drop policy if exists perfiles_yo on public.perfiles;
create policy perfiles_yo on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_lider());

drop policy if exists perfiles_lider on public.perfiles;
create policy perfiles_lider on public.perfiles for all to authenticated
  using (public.es_lider()) with check (public.es_lider());

-- Colegios
drop policy if exists colegios_lectura on public.colegios;
create policy colegios_lectura on public.colegios for select to authenticated
  using (public.puedo_ver_colegio(id));

drop policy if exists colegios_lider on public.colegios;
create policy colegios_lider on public.colegios for all to authenticated
  using (public.es_lider()) with check (public.es_lider());

-- Cursos
drop policy if exists cursos_lectura on public.cursos;
create policy cursos_lectura on public.cursos for select to authenticated
  using (public.puedo_ver_colegio(colegio_id));

drop policy if exists cursos_lider on public.cursos;
create policy cursos_lider on public.cursos for all to authenticated
  using (public.es_lider()) with check (public.es_lider());

-- Asignaciones
drop policy if exists asignaciones_lectura on public.asignaciones;
create policy asignaciones_lectura on public.asignaciones for select to authenticated
  using (profesor_id = auth.uid() or public.es_lider());

drop policy if exists asignaciones_lider on public.asignaciones;
create policy asignaciones_lider on public.asignaciones for all to authenticated
  using (public.es_lider()) with check (public.es_lider());

-- Estudiantes: los profesores pueden agregar y editar los de sus colegios
drop policy if exists estudiantes_lectura on public.estudiantes;
create policy estudiantes_lectura on public.estudiantes for select to authenticated
  using (public.puedo_ver_colegio(colegio_id));

drop policy if exists estudiantes_escritura on public.estudiantes;
create policy estudiantes_escritura on public.estudiantes for all to authenticated
  using (public.puedo_ver_colegio(colegio_id))
  with check (public.puedo_ver_colegio(colegio_id));

-- Clases: el profesor puede crear y corregir las suyas dentro de 30 días
drop policy if exists clases_lectura on public.clases;
create policy clases_lectura on public.clases for select to authenticated
  using (public.puedo_ver_colegio(colegio_id));

drop policy if exists clases_insertar on public.clases;
create policy clases_insertar on public.clases for insert to authenticated
  with check (
    public.es_lider()
    or (profesor_id = auth.uid() and public.puedo_ver_colegio(colegio_id))
  );

drop policy if exists clases_corregir on public.clases;
create policy clases_corregir on public.clases for update to authenticated
  using (
    public.es_lider()
    or (profesor_id = auth.uid() and public.puedo_ver_colegio(colegio_id)
        and fecha >= (current_date - interval '30 days'))
  )
  with check (
    public.es_lider()
    or (profesor_id = auth.uid() and public.puedo_ver_colegio(colegio_id))
  );

-- Registros: siguen la suerte de su clase
drop policy if exists registros_lectura on public.registros;
create policy registros_lectura on public.registros for select to authenticated
  using (exists (select 1 from public.clases c
                 where c.id = clase_id and public.puedo_ver_colegio(c.colegio_id)));

drop policy if exists registros_escritura on public.registros;
create policy registros_escritura on public.registros for all to authenticated
  using (exists (select 1 from public.clases c
                 where c.id = clase_id and public.puedo_ver_colegio(c.colegio_id)))
  with check (exists (select 1 from public.clases c
                 where c.id = clase_id and public.puedo_ver_colegio(c.colegio_id)));

-- ---------------------------------------------------------------
-- 6. Permisos para los usuarios con sesión
-- ---------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------
-- 7. Perfil automático al crear una cuenta
--    Cada persona que se cree en Authentication recibe su perfil
--    como 'profesor'. Ya no hay que copiar UUIDs a mano.
-- ---------------------------------------------------------------
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    'profesor'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
after insert on auth.users
for each row execute function public.crear_perfil();

-- Si ya habías creado cuentas antes de ejecutar esto, créales el perfil:
insert into public.perfiles (id, nombre, rol)
select u.id,
       coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1)),
       'profesor'
from auth.users u
left join public.perfiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 8. Último paso: dejar tu cuenta como líder
--    Cambia el correo y ejecuta:
--
--    update public.perfiles
--       set rol = 'lider', nombre = 'Tu nombre'
--     where id = (select id from auth.users where email = 'tu-correo@ejemplo.cl');
--
-- Para comprobar cómo quedaron las cuentas:
--
--    select u.email, p.nombre, p.rol
--      from public.perfiles p join auth.users u on u.id = p.id
--     order by p.rol, u.email;
-- ---------------------------------------------------------------
