ALTER TABLE "inscripciones_carrera" DROP CONSTRAINT "inscripciones_carrera_ciclo_ck";--> statement-breakpoint
ALTER TABLE "inscripciones_carrera" ADD COLUMN "periodo_inicio_id" uuid;--> statement-breakpoint
ALTER TABLE "inscripciones_carrera" ADD CONSTRAINT "inscripciones_carrera_periodo_inicio_id_periodos_academicos_id_fk" FOREIGN KEY ("periodo_inicio_id") REFERENCES "public"."periodos_academicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inscripciones_carrera_periodo_inicio_idx" ON "inscripciones_carrera" USING btree ("periodo_inicio_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM carreras
    WHERE lower(trim(nombre)) IN ('actuación', 'actuacion')
      AND estado = 'activo'
  ) THEN
    RAISE EXCEPTION 'No existe una carrera activa llamada Actuación';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM planes_curriculares pc
    JOIN carreras c ON c.id = pc.carrera_id
    WHERE lower(trim(c.nombre)) IN ('actuación', 'actuacion')
      AND c.estado = 'activo'
      AND pc.estado = 'activo'
  ) THEN
    RAISE EXCEPTION 'La carrera Actuación no tiene un plan curricular activo';
  END IF;
END $$;
--> statement-breakpoint
WITH actuacion AS (
  SELECT id, nombre
  FROM carreras
  WHERE lower(trim(nombre)) IN ('actuación', 'actuacion')
    AND estado = 'activo'
  ORDER BY created_at DESC
  LIMIT 1
),
periodos_necesarios AS (
  SELECT DISTINCT
    a.id AS carrera_id,
    a.nombre AS carrera_nombre,
    split_part(replace(pa.periodo_ingreso, ' ', ''), '-', 1)::integer AS anio,
    split_part(replace(pa.periodo_ingreso, ' ', ''), '-', 2)::academic_period_number AS periodo
  FROM perfiles_alumno pa
  CROSS JOIN actuacion a
  UNION
  SELECT DISTINCT
    ic.carrera_id,
    c.nombre,
    split_part(replace(pa.periodo_ingreso, ' ', ''), '-', 1)::integer,
    split_part(replace(pa.periodo_ingreso, ' ', ''), '-', 2)::academic_period_number
  FROM inscripciones_carrera ic
  JOIN perfiles_alumno pa ON pa.persona_id = ic.persona_id
  JOIN carreras c ON c.id = ic.carrera_id
)
INSERT INTO periodos_academicos (
  carrera_id, anio, periodo, nombre, fecha_inicio, fecha_fin, estado
)
SELECT
  pn.carrera_id,
  pn.anio,
  pn.periodo,
  pn.carrera_nombre || ' ' || pn.anio || '-' || pn.periodo::text,
  make_date(pn.anio, CASE pn.periodo WHEN 'I' THEN 1 WHEN 'II' THEN 5 ELSE 9 END, 1),
  CASE pn.periodo
    WHEN 'I' THEN make_date(pn.anio, 4, 30)
    WHEN 'II' THEN make_date(pn.anio, 8, 31)
    ELSE make_date(pn.anio, 12, 31)
  END,
  'culminado'
FROM periodos_necesarios pn
ON CONFLICT (carrera_id, anio, periodo) DO NOTHING;
--> statement-breakpoint
UPDATE inscripciones_carrera ic
SET periodo_inicio_id = p.id
FROM perfiles_alumno pa, periodos_academicos p
WHERE pa.persona_id = ic.persona_id
  AND p.carrera_id = ic.carrera_id
  AND p.anio = split_part(replace(pa.periodo_ingreso, ' ', ''), '-', 1)::integer
  AND p.periodo = split_part(replace(pa.periodo_ingreso, ' ', ''), '-', 2)::academic_period_number
  AND ic.periodo_inicio_id IS NULL;
--> statement-breakpoint
WITH actuacion AS (
  SELECT id
  FROM carreras
  WHERE lower(trim(nombre)) IN ('actuación', 'actuacion')
    AND estado = 'activo'
  ORDER BY created_at DESC
  LIMIT 1
),
plan_activo AS (
  SELECT pc.id, pc.carrera_id
  FROM planes_curriculares pc
  JOIN actuacion a ON a.id = pc.carrera_id
  WHERE pc.estado = 'activo'
  ORDER BY pc.created_at DESC, pc.version DESC
  LIMIT 1
)
INSERT INTO inscripciones_carrera (
  persona_id, carrera_id, plan_curricular_id, periodo_inicio_id,
  fecha_inicio, ciclo_inicio, estado
)
SELECT
  pa.persona_id,
  p.carrera_id,
  plan_activo.id,
  p.id,
  p.fecha_inicio,
  1,
  'activo'
FROM perfiles_alumno pa
CROSS JOIN plan_activo
JOIN periodos_academicos p
  ON p.carrera_id = plan_activo.carrera_id
 AND p.anio = split_part(replace(pa.periodo_ingreso, ' ', ''), '-', 1)::integer
 AND p.periodo = split_part(replace(pa.periodo_ingreso, ' ', ''), '-', 2)::academic_period_number
WHERE NOT EXISTS (
  SELECT 1
  FROM inscripciones_carrera existente
  WHERE existente.persona_id = pa.persona_id
    AND existente.estado = 'activo'
);
