CREATE TYPE "public"."fuente_antecedente_academico" AS ENUM('manual', 'importacion');--> statement-breakpoint
CREATE TYPE "public"."estado_inscripcion_carrera" AS ENUM('activo', 'inactivo');--> statement-breakpoint
CREATE TABLE "antecedentes_academicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"plan_curso_id" uuid NOT NULL,
	"resultado" varchar(20) DEFAULT 'aprobado' NOT NULL,
	"fecha_referencial" date,
	"periodo_referencial" varchar(100),
	"observacion" text,
	"fuente" "fuente_antecedente_academico" DEFAULT 'manual' NOT NULL,
	"reconocido_por_persona_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "antecedentes_academicos_resultado_ck" CHECK ("antecedentes_academicos"."resultado" = 'aprobado'),
	CONSTRAINT "antecedentes_academicos_referencia_ck" CHECK ("antecedentes_academicos"."fecha_referencial" is not null or "antecedentes_academicos"."periodo_referencial" is not null)
);
--> statement-breakpoint
CREATE TABLE "inscripciones_carrera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"carrera_id" uuid NOT NULL,
	"plan_curricular_id" uuid NOT NULL,
	"fecha_inicio" date NOT NULL,
	"ciclo_inicio" integer NOT NULL,
	"estado" "estado_inscripcion_carrera" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "inscripciones_carrera_ciclo_ck" CHECK ("inscripciones_carrera"."ciclo_inicio" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "antecedentes_academicos" ADD CONSTRAINT "antecedentes_academicos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antecedentes_academicos" ADD CONSTRAINT "antecedentes_academicos_plan_curso_id_plan_cursos_id_fk" FOREIGN KEY ("plan_curso_id") REFERENCES "public"."plan_cursos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antecedentes_academicos" ADD CONSTRAINT "antecedentes_academicos_reconocido_por_persona_id_personas_id_fk" FOREIGN KEY ("reconocido_por_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscripciones_carrera" ADD CONSTRAINT "inscripciones_carrera_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscripciones_carrera" ADD CONSTRAINT "inscripciones_carrera_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscripciones_carrera" ADD CONSTRAINT "inscripciones_carrera_plan_curricular_id_planes_curriculares_id_fk" FOREIGN KEY ("plan_curricular_id") REFERENCES "public"."planes_curriculares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "antecedentes_academicos_persona_curso_uq" ON "antecedentes_academicos" USING btree ("persona_id","plan_curso_id");--> statement-breakpoint
CREATE INDEX "antecedentes_academicos_persona_idx" ON "antecedentes_academicos" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "antecedentes_academicos_plan_curso_idx" ON "antecedentes_academicos" USING btree ("plan_curso_id");--> statement-breakpoint
CREATE INDEX "antecedentes_academicos_actor_idx" ON "antecedentes_academicos" USING btree ("reconocido_por_persona_id");--> statement-breakpoint
CREATE INDEX "inscripciones_carrera_persona_idx" ON "inscripciones_carrera" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "inscripciones_carrera_carrera_idx" ON "inscripciones_carrera" USING btree ("carrera_id");--> statement-breakpoint
CREATE INDEX "inscripciones_carrera_plan_idx" ON "inscripciones_carrera" USING btree ("plan_curricular_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inscripciones_carrera_activa_uq" ON "inscripciones_carrera" USING btree ("persona_id","carrera_id","plan_curricular_id") WHERE "inscripciones_carrera"."estado" = 'activo';
