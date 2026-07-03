CREATE TYPE "public"."estado_acta_academica" AS ENUM('borrador', 'publicada');--> statement-breakpoint
CREATE TYPE "public"."resultado_academico" AS ENUM('aprobado', 'desaprobado');--> statement-breakpoint
CREATE TABLE "actas_academicas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"estado" "estado_acta_academica" DEFAULT 'borrador' NOT NULL,
	"publicada_at" timestamp with time zone,
	"publicada_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "actas_academicas_publicacion_ck" CHECK (("actas_academicas"."estado" = 'borrador' and "actas_academicas"."publicada_at" is null and "actas_academicas"."publicada_por" is null)
      or ("actas_academicas"."estado" = 'publicada' and "actas_academicas"."publicada_at" is not null and "actas_academicas"."publicada_por" is not null))
);
--> statement-breakpoint
CREATE TABLE "historial_academico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"plan_curso_id" uuid NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"acta_academica_id" uuid NOT NULL,
	"nota_final" numeric(5, 2) NOT NULL,
	"letra" varchar(1) NOT NULL,
	"resultado" "resultado_academico" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "historial_academico_nota_ck" CHECK ("historial_academico"."nota_final" >= 0 and "historial_academico"."nota_final" <= 20),
	CONSTRAINT "historial_academico_letra_ck" CHECK ("historial_academico"."letra" in ('A', 'B', 'C', 'D'))
);
--> statement-breakpoint
ALTER TABLE "actas_academicas" ADD CONSTRAINT "actas_academicas_curso_programado_id_cursos_programados_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actas_academicas" ADD CONSTRAINT "actas_academicas_publicada_por_personas_id_fk" FOREIGN KEY ("publicada_por") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_academico" ADD CONSTRAINT "historial_academico_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_academico" ADD CONSTRAINT "historial_academico_plan_curso_id_plan_cursos_id_fk" FOREIGN KEY ("plan_curso_id") REFERENCES "public"."plan_cursos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_academico" ADD CONSTRAINT "historial_academico_curso_programado_id_cursos_programados_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_academico" ADD CONSTRAINT "historial_academico_periodo_academico_id_periodos_academicos_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodos_academicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_academico" ADD CONSTRAINT "historial_academico_acta_academica_id_actas_academicas_id_fk" FOREIGN KEY ("acta_academica_id") REFERENCES "public"."actas_academicas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actas_academicas_curso_uq" ON "actas_academicas" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE INDEX "actas_academicas_publicada_por_idx" ON "actas_academicas" USING btree ("publicada_por");--> statement-breakpoint
CREATE UNIQUE INDEX "historial_academico_persona_curso_programado_uq" ON "historial_academico" USING btree ("persona_id","curso_programado_id");--> statement-breakpoint
CREATE INDEX "historial_academico_persona_idx" ON "historial_academico" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "historial_academico_plan_curso_idx" ON "historial_academico" USING btree ("plan_curso_id");--> statement-breakpoint
CREATE INDEX "historial_academico_periodo_idx" ON "historial_academico" USING btree ("periodo_academico_id");--> statement-breakpoint
CREATE INDEX "historial_academico_acta_idx" ON "historial_academico" USING btree ("acta_academica_id");