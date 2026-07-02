DROP INDEX "periodos_academicos_anio_periodo_uq";--> statement-breakpoint
ALTER TABLE "periodos_academicos" ADD COLUMN "carrera_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "periodos_academicos" ADD CONSTRAINT "periodos_academicos_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "periodos_academicos_carrera_anio_periodo_uq" ON "periodos_academicos" USING btree ("carrera_id","anio","periodo");--> statement-breakpoint
CREATE INDEX "periodos_academicos_carrera_idx" ON "periodos_academicos" USING btree ("carrera_id");