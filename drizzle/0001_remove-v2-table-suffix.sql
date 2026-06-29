-- Renombra constraints primero para mantener nombres coherentes con el schema.
do $$
declare
  item record;
begin
  for item in
    select conrelid, conname
    from pg_constraint
    where conname like '%\_v2%' escape '\'
  loop
    execute format(
      'alter table %s rename constraint %I to %I',
      item.conrelid::regclass,
      item.conname,
      replace(item.conname, '_v2', '')
    );
  end loop;
end $$;
--> statement-breakpoint
-- Renombra índices explícitos que contienen el sufijo.
do $$
declare
  item record;
begin
  for item in
    select schemaname, indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname like '%\_v2%' escape '\'
  loop
    execute format(
      'alter index %I.%I rename to %I',
      item.schemaname,
      item.indexname,
      replace(item.indexname, '_v2', '')
    );
  end loop;
end $$;
--> statement-breakpoint
alter table "roles_v2" rename to "roles";
--> statement-breakpoint
alter table "carreras_v2" rename to "carreras";
--> statement-breakpoint
alter table "cursos_v2" rename to "cursos";
--> statement-breakpoint
alter table "cursos_programados_v2" rename to "cursos_programados";
--> statement-breakpoint
alter table "asistencias_v2" rename to "asistencias";
