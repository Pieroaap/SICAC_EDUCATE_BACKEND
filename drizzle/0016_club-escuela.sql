DO $$
DECLARE
  target_id uuid;
  matches integer;
BEGIN
  SELECT count(*), min(id::text)::uuid
  INTO matches, target_id
  FROM carreras
  WHERE upper(trim(codigo)) = 'ACTUACION'
     OR lower(trim(nombre)) IN ('actuacion', 'actuación', 'actuaciÃ³n', 'club escuela');

  IF matches = 0 THEN
    RAISE NOTICE 'No se encontró la carrera Actuación; no se realizaron cambios';
    RETURN;
  END IF;

  IF matches > 1 THEN
    RAISE EXCEPTION 'Se encontraron % carreras candidatas para Club Escuela', matches;
  END IF;

  UPDATE carreras
  SET nombre = 'Club Escuela', updated_at = now()
  WHERE id = target_id AND nombre <> 'Club Escuela';

  UPDATE periodos_academicos
  SET nombre = 'Club Escuela ' || anio || '-' || periodo::text,
      updated_at = now()
  WHERE carrera_id = target_id
    AND nombre <> 'Club Escuela ' || anio || '-' || periodo::text;

  UPDATE planes_curriculares
  SET nombre = 'Club Escuela ' || version,
      updated_at = now()
  WHERE carrera_id = target_id
    AND lower(trim(nombre)) ~ '^actua';
END $$;
