-- =============================================================
--  Talleres: reemplazan al curso como etiqueta de la clase
--  Ejecutar en SQL Editor (una vez) en cada proyecto.
--
--  La clase pasa a identificarse por: colegio + taller + fecha.
--  El curso se conserva como dato interno (agrupa a los estudiantes).
-- =============================================================

alter table public.clases add column if not exists taller text not null default '';

-- El curso deja de ser obligatorio: la clase pertenece al colegio
alter table public.clases alter column curso_id drop not null;

-- Si los cursos ya se llaman "9.1", "10.2", etc., se usa ese nombre como taller
update public.clases c
   set taller = k.nombre
  from public.cursos k
 where c.curso_id = k.id
   and (c.taller = '' or c.taller is null)
   and k.nombre ~ '^[0-9]+\.[0-9]$';

do $$
begin
  alter table public.clases drop constraint if exists clases_curso_id_fecha_key;
  begin
    alter table public.clases
      add constraint clases_colegio_taller_fecha_key unique (colegio_id, taller, fecha);
  exception when others then
    raise notice 'No se pudo crear la clave unica (colegio, taller, fecha): hay clases repetidas. La app seguira funcionando.';
  end;
end $$;

create index if not exists clases_taller_idx on public.clases (taller);
