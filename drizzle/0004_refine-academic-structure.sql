-- Custom SQL migration file, put your code below! --
CREATE TYPE "public"."course_type" AS ENUM ('obligatorio', 'electivo');
CREATE TYPE "public"."academic_period_number" AS ENUM ('I', 'II', 'III');

ALTER TABLE "cursos" ADD COLUMN "tipo" "course_type" DEFAULT 'obligatorio' NOT NULL;

UPDATE "cursos"
SET "tipo" = CASE
  WHEN lower(trim(coalesce("descripcion", ''))) = 'electivo' THEN 'electivo'::"course_type"
  ELSE 'obligatorio'::"course_type"
END;

ALTER TABLE "cursos" DROP COLUMN "descripcion";

ALTER TABLE "periodos_academicos" ADD COLUMN "anio" integer;
ALTER TABLE "periodos_academicos" ADD COLUMN "periodo" "academic_period_number";

UPDATE "periodos_academicos"
SET
  "anio" = coalesce(
    substring(coalesce("codigo", '') from '(19[0-9]{2}|20[0-9]{2})')::integer,
    substring(coalesce("nombre", '') from '(19[0-9]{2}|20[0-9]{2})')::integer,
    extract(year from "fecha_inicio")::integer
  ),
  "periodo" = CASE
    WHEN upper(coalesce("codigo", '') || ' ' || coalesce("nombre", '')) ~ '(^|[^I])III([^I]|$)' THEN 'III'::"academic_period_number"
    WHEN upper(coalesce("codigo", '') || ' ' || coalesce("nombre", '')) ~ '(^|[^I])II([^I]|$)' THEN 'II'::"academic_period_number"
    WHEN upper(coalesce("codigo", '') || ' ' || coalesce("nombre", '')) ~ '(^|[^I])I([^I]|$)' THEN 'I'::"academic_period_number"
    WHEN extract(month from "fecha_inicio") <= 4 THEN 'I'::"academic_period_number"
    WHEN extract(month from "fecha_inicio") <= 8 THEN 'II'::"academic_period_number"
    ELSE 'III'::"academic_period_number"
  END;

UPDATE "periodos_academicos"
SET "nombre" = "anio"::text || ' - ' || "periodo"::text;

ALTER TABLE "periodos_academicos" ALTER COLUMN "anio" SET NOT NULL;
ALTER TABLE "periodos_academicos" ALTER COLUMN "periodo" SET NOT NULL;
ALTER TABLE "periodos_academicos" DROP CONSTRAINT IF EXISTS "periodos_academicos_codigo_uq";
DROP INDEX IF EXISTS "periodos_academicos_codigo_uq";
ALTER TABLE "periodos_academicos" DROP COLUMN "codigo";
ALTER TABLE "periodos_academicos"
  ADD CONSTRAINT "periodos_academicos_anio_ck" CHECK ("anio" between 1900 and 9999);
CREATE UNIQUE INDEX "periodos_academicos_anio_periodo_uq"
  ON "periodos_academicos" USING btree ("anio", "periodo");
