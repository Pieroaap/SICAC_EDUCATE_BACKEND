ALTER TABLE "inscripciones_carrera" ALTER COLUMN "periodo_inicio_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inscripciones_carrera" DROP COLUMN "fecha_inicio";--> statement-breakpoint
ALTER TABLE "inscripciones_carrera" DROP COLUMN "ciclo_inicio";