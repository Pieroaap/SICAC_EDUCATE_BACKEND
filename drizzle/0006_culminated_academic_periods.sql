CREATE TYPE "public"."estado_periodo_academico" AS ENUM('activo', 'culminado');
ALTER TABLE "periodos_academicos" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "periodos_academicos" ALTER COLUMN "estado" TYPE "public"."estado_periodo_academico"
USING (CASE WHEN "estado"::text = 'activo' THEN 'activo' ELSE 'culminado' END)::"public"."estado_periodo_academico";
ALTER TABLE "periodos_academicos" ALTER COLUMN "estado" SET DEFAULT 'activo';
