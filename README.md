# SICAC Backend

API académica del Club de Arte y Cultura, construida con Fastify, TypeScript,
Drizzle ORM, PostgreSQL/Supabase Auth y documentación OpenAPI.

## Configuración local

1. Copia `.env.example` como `.env`.
2. En Supabase, abre **Project Settings > Database > Connection string** y copia
   la URI del pooler en `DATABASE_URL`.
3. En **Project Settings > API**, copia la URL y la clave pública en
   `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
4. Ejecuta:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

La documentación interactiva queda disponible en
`http://localhost:3000/documentacion`.

Nunca compartas ni confirmes en Git el archivo `.env`. Este backend no requiere
la clave `service_role` en el frontend. El backend sí la usa para aprovisionar
cuentas mediante Supabase Auth Admin.

## Primer administrador

Agrega temporalmente al `.env`:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=...
BOOTSTRAP_ADMIN_DNI=...
BOOTSTRAP_ADMIN_NOMBRES=...
BOOTSTRAP_ADMIN_APELLIDO_PATERNO=...
BOOTSTRAP_ADMIN_APELLIDO_MATERNO=...
# Opcional: si se omite, SICAC crea un correo técnico interno.
BOOTSTRAP_ADMIN_EMAIL=...
```

Ejecuta una sola vez:

```bash
npm run admin:bootstrap
```

El script se bloquea si ya existe un administrador activo. La contraseña
temporal será el DNI y deberá cambiarse mediante `POST /auth/cambiar-clave`
antes de usar endpoints administrativos. Las variables `BOOTSTRAP_ADMIN_*`
pueden eliminarse después; `SUPABASE_SERVICE_ROLE_KEY` debe permanecer solo en
el entorno seguro del backend.

Si el administrador principal pierde su contraseña y no existe otro
administrador que pueda asistirlo, agrega temporalmente
`RESET_ADMIN_DNI=...` al `.env` y ejecuta:

```bash
npm run admin:reset-password
```

Para los demás usuarios, un administrador o director autorizado puede usar
`POST /usuarios/:personaId/reiniciar-clave`. La clave vuelve temporalmente al
documento y el sistema obliga a cambiarla en el siguiente ingreso. Un director
no puede reiniciar cuentas de administradores.

## Personas y cuentas de acceso

`personas` es la identidad institucional y no implica acceso al sistema. Los
niños de PROFAIC, sus padres o tutores y los participantes externos pueden
existir únicamente en `personas`. Solo quienes deban iniciar sesión tendrán,
además, una fila en `usuarios_auth` y una cuenta vinculada en Supabase Auth.

`POST /usuarios` crea personas **con acceso**. Los flujos académicos que
registran alumnos, tutores o externos sin acceso no deben crear cuentas en
Supabase Auth.

## Importación inicial

- `POST /importaciones/alumnos`: valida o importa hasta 1000 alumnos por lote.
- `POST /importaciones/profesores`: valida o importa profesores sin crearles acceso.
- Enviar primero `dryRun: true`; el lote no escribe si existe algún error.
- `POST /personas/:personaId/acceso`: habilita posteriormente una cuenta sin
  duplicar la persona.
- `GET /alumnos` y `GET /profesores` devuelven vistas consolidadas para el frontend.

La carpeta `data/` está ignorada por Git para evitar confirmar archivos con
información personal.
