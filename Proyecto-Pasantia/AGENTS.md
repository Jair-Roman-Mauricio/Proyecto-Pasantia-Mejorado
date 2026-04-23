# AGENTS.md — Línea 1 Metro · Sistema de Gestión Energética

Este archivo define el contexto del proyecto para agentes de IA (GitHub Copilot, Claude Code, Cursor, etc.).
Úsalo como fuente de verdad antes de hacer cualquier cambio de código.

---

## 0. Skills — Instrucción de carga obligatoria

Todas las skills se encuentran en `../skills/` (carpeta al mismo nivel que `Proyecto-Pasantia/`).

```
skills/
├── linea1metro/                      ← dominio del proyecto (SIEMPRE LEER)
│   └── SKILL.md
├── mastering-typescript/             ← TypeScript avanzado
│   └── SKILL.md + references/
├── react-best-practices/             ← rendimiento y patrones React
│   └── SKILL.md + rules/
├── supabase/                         ← cliente supabase-js, Auth, Storage, RLS, Edge Functions
│   └── SKILL.md
└── supabase-postgres-best-practices/ ← SQL, índices, esquema, conexiones, RLS
    └── SKILL.md + references/
```

---

### Paso 1 — SIEMPRE (en toda petición sin excepción)

**Lee `../skills/linea1metro/SKILL.md` antes de responder.**
Contiene el modelo de dominio completo: tablas, relaciones, fórmulas eléctricas, flujos de
negocio y convenciones de código. Es la base obligatoria de toda modificación al proyecto.

---

### Paso 2 — Condicional: añade las skills técnicas que apliquen

| Si la petición menciona o toca… | Leer adicionalmente |
|---------------------------------|---------------------|
| Tipos, interfaces, generics, `satisfies`, Zod, tsconfig, ESLint, Vitest, toolchain, archivos `.ts` | `../skills/mastering-typescript/SKILL.md` |
| Componentes React, hooks, `useEffect`, `useMemo`, re-renders, bundle, Vite, lazy loading, Suspense, archivos `.tsx` | `../skills/react-best-practices/SKILL.md` |
| `supabase-js`, Auth (`signIn`, `signOut`, `getUser`, sesiones, JWT), Storage, Edge Functions, Realtime, RLS desde el cliente, políticas de seguridad | `../skills/supabase/SKILL.md` |
| SQL, DDL, índices, esquema PostgreSQL, `EXPLAIN`, RLS policies, conexiones, particionado, vacío, `pg_stat`, upsert, paginación | `../skills/supabase-postgres-best-practices/SKILL.md` |
| Varias áreas simultáneas | Leer todas las que apliquen |
| Solo lógica de negocio pura (sin código técnico nuevo) | Solo la skill de dominio |

---

### Referencias rápidas dentro de las skills técnicas

**TypeScript**
- Sistema de tipos: `../skills/mastering-typescript/references/type-system.md`
- Generics: `../skills/mastering-typescript/references/generics.md`
- Patrones empresa: `../skills/mastering-typescript/references/enterprise-patterns.md`
- Integración React: `../skills/mastering-typescript/references/react-integration.md`

**React**
- Eliminar waterfalls: `../skills/react-best-practices/rules/async-*.md`
- Evitar re-renders: `../skills/react-best-practices/rules/rerender-*.md`
- Bundle size: `../skills/react-best-practices/rules/bundle-*.md`
- Rendimiento cliente: `../skills/react-best-practices/rules/client-*.md`

**Supabase (cliente JS)**
- Seguridad y trampas: sección "Security checklist" en `../skills/supabase/SKILL.md`
- CLI y MCP: sección "Supabase CLI" en `../skills/supabase/SKILL.md`

**Supabase Postgres**
- Índices faltantes: `../skills/supabase-postgres-best-practices/references/query-missing-indexes.md`
- Índices parciales: `../skills/supabase-postgres-best-practices/references/query-partial-indexes.md`
- RLS rendimiento: `../skills/supabase-postgres-best-practices/references/security-rls-performance.md`
- RLS fundamentos: `../skills/supabase-postgres-best-practices/references/security-rls-basics.md`
- Conexiones / pooling: `../skills/supabase-postgres-best-practices/references/conn-pooling.md`
- Upsert: `../skills/supabase-postgres-best-practices/references/data-upsert.md`
- Paginación: `../skills/supabase-postgres-best-practices/references/data-pagination.md`
- Tipos de datos: `../skills/supabase-postgres-best-practices/references/schema-data-types.md`

---

## 1. Descripción del Proyecto

Sistema web de gestión de subestaciones eléctricas de la **Línea 1 del Metro de Lima (Perú)**.
Permite al personal técnico (admin y opersac) monitorear la carga eléctrica de 26 estaciones,
gestionar circuitos, aprobar solicitudes de ampliación de carga y generar backups.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| UI | React | 19 |
| Lenguaje | TypeScript | ~5.9 |
| Bundler | Vite | 7 |
| Estilos | Tailwind CSS (plugin Vite) | 4 |
| BaaS / DB | Supabase (PostgreSQL + Auth + Storage) | supabase-js 2 |
| Iconos | lucide-react | latest |
| Gráficos | recharts | 3 |
| Exportación | xlsx | 0.18 |
| Routing | react-router-dom | 7 |
| Servidor HTTP backup | Express + node-cron | Node 20 |
| Contenedores | Docker + docker-compose | — |

**No existe backend FastAPI activo**. La migración a Supabase está completa.
Todo acceso a datos se hace desde `@supabase/supabase-js` en el cliente.

---

## 3. Estructura de Directorios

```
Proyecto-Pasantia/
├── frontend/                   ← app React/TS (Vite)
│   └── src/
│       ├── config/             ← supabaseClient.ts, supabaseAdminClient.ts, constants.ts
│       ├── context/            ← AuthContext, SidebarContext, ThemeContext
│       ├── services/           ← una función async por dominio (Supabase)
│       ├── types/              ← index.ts (interfaces), enums.ts (const objects)
│       ├── utils/              ← energyCalculator.ts (lógica de cálculo)
│       ├── hooks/              ← hooks personalizados de React
│       ├── components/         ← componentes por dominio (station-detail/, backup/, etc.)
│       └── pages/              ← DashboardPage, LoginPage, StationDetailPage
├── backup-service/             ← microservicio Node.js Docker para backups
│   └── src/index.js
├── sql/                        ← DDL Supabase (supabase_schema.sql, vistas públicas, etc.)
├── nginx/                      ← nginx.conf para el contenedor frontend
├── docs/                       ← documentación técnica
└── docker-compose.yml
```

---

## 4. Esquema de Base de Datos

### Schema y acceso
- Las tablas reales están en el schema `"Subest"`.
- PostgREST solo expone el schema `public`, por lo que **todas las tablas tienen una vista espejo en `public`**.
- Los servicios TypeScript siempre consultan los nombres sin schema (e.g. `supabase.from('circuits')`).

### Tablas y relaciones

```
stations (1)
  └── bars (N)  ← station_id FK → stations.id  [CASCADE DELETE]
       └── circuits (N)  ← bar_id FK → bars.id  [CASCADE DELETE]
            ├── secondary_bar_id  FK → bars.id  (referencia secundaria, nullable)
            ├── tertiary_bar_id   FK → bars.id  (referencia terciaria, nullable)
            └── sub_circuits (N)  ← circuit_id FK → circuits.id  [CASCADE DELETE]

users (UUID = Supabase Auth id)
  ├── permissions (N)  ← user_id FK → users.id  [CASCADE DELETE]
  └── requests (N)  ← opersac_user_id FK → users.id
       ├── station_id FK → stations.id
       └── circuit_id FK → circuits.id  (nullable: null = nuevo circuito)

observations
  ├── circuit_id    FK → circuits.id    (SET NULL on delete)
  ├── sub_circuit_id FK → sub_circuits.id (SET NULL on delete)
  ├── bar_id        FK → bars.id        (SET NULL on delete)
  └── user_id       FK → users.id

notifications
  ├── station_id FK → stations.id  (SET NULL on delete)
  └── circuit_id FK → circuits.id  (SET NULL on delete)

audit_logs
  └── user_id FK → users.id

backups
  └── created_by FK → users.id
```

---

## 5. Lógica de Negocio Crítica

### 5.1 Cálculo de Demanda (`src/utils/energyCalculator.ts`)

**Regla fundamental — nunca romperla:**

```
md_kw = pi_kw × fd
```

- `pi_kw`: potencia instalada del circuito (kW)
- `fd`: factor de demanda (valor entre 0 y 1)
- `md_kw`: demanda máxima resultante (kW)

**Cálculo de demanda por barra:**
- Solo circuitos con `status ≠ 'inactive'` contribuyen a la demanda.
- `barra.md_total = sum(circuit.md_kw) para circuitos activos`

**Factor por tipo de barra:**
- `normal`: factor = `1.0`
- `emergency`: factor = `0.75`
- `continuity`: factor = `0.75`

**Cálculo de demanda de la estación:**
```
station.max_demand_kw = Σ (barMd × factor) para cada barra activa
station.available_power_kw = transformer_capacity_kw - max_demand_kw
```

**Semáforo de la estación:**
| Color | Condición |
|-------|-----------|
| `red` | `max_demand_kw > transformer_capacity_kw` |
| `yellow` | `available_power_kw / transformer_capacity_kw < 0.20` |
| `green` | cualquier otro caso |

**Cuándo recalcular:** Se debe llamar a `recalculateStation(stationId)` después de cualquier
CREATE / UPDATE / DELETE sobre `circuits` o `sub_circuits`, y después de cambiar el `status` de una barra.

### 5.2 Estados de Circuitos

```
operative_normal      → operativo; cuenta en la demanda
reserve_r             → reserva sin equipar; cuenta en la demanda
reserve_equipped_re   → reserva equipada; cuenta en la demanda
inactive              → fuera de servicio; NO cuenta en la demanda
```

Al cambiar un circuito a `inactive` se borran automáticamente `reserve_since` y `reserve_expires_at`.
Al cambiar a `reserve_r` o `reserve_equipped_re` se asigna `reserve_since = today` si no tiene valor.

### 5.3 Flujo de Solicitudes de Ampliación (`requestService.ts`)

1. Un usuario `opersac` envía una `LoadRequest` con estado `pending`.
2. Un `admin` la aprueba o rechaza.
3. **Al aprobar:**
   - Si `request.circuit_id === null` → se crea un **nuevo circuito** en la barra cuyo `bar_type` coincide con `request.bar_type` dentro de la estación indicada.
   - Si `request.circuit_id !== null` → se crea un **nuevo subcircuito** dentro de ese circuito.
   - El estado del objeto creado respeta `requested_status` y `reserve_expires_at` del opersac.
   - Siempre se llama a `recalculateStation` tras la creación.
4. Al rechazar se requiere un `rejection_reason` obligatorio.

### 5.4 Notificaciones Automáticas

El sistema genera notificaciones tipo `reserve_no_contact` cuando detecta circuitos o subcircuitos
con `reserve_expires_at <= hoy` y `status ≠ inactive / operative_normal`.

Esta detección se ejecuta **en el cliente** al iniciar sesión (`notificationService.checkExpiringReserves()`),
no existe cron server-side para esto (excepto el backup-service para backups).

Tipos de notificación:
- `reserve_no_contact`: reserva vencida sin contacto con el cliente
- `negative_energy`: estación en sobrecarga
- `request_pending`: solicitud pendiente de aprobación
- `system`: mensaje de sistema genérico

### 5.5 Autenticación

- Supabase Auth con `signInWithPassword`.
- Convención de email: `{username}@linea1metro.internal` (no se usan emails reales).
- Tras autenticar se consulta `public.users` para obtener el perfil y rol.
- Usuarios con `status = 'inactive'` o `'reported'` son bloqueados y se hace `signOut` inmediato.
- Permisos del rol `opersac` se cargan desde `public.permissions` y se almacenan en `AuthContext`.

### 5.6 Permisos (rol opersac)

Los `opersac` tienen acceso granular por `feature_key`:
```
view_stations     → ver el mapa de estaciones
view_circuits     → ver circuitos / barras
send_requests     → crear solicitudes de ampliación
add_observations  → agregar observaciones técnicas
view_reports      → acceder a la vista de reportes
```

Los `admin` tienen acceso total sin restricciones de permisos.

### 5.7 Imágenes (Supabase Storage)

Bucket: `imagenes`. Estructura de rutas:
```
imagenes-unifilares/{station_id}/current.<ext>
fotos-transformadores/{station_id}/current.<ext>
imagenes-barras/{bar_id}/current.{ext}
imagenes-circuitos/{circuit_id}/current.<ext>
```
Solo se conserva una imagen activa por entidad. Formatos permitidos: jpg, jpeg, png, webp. Máximo 10 MB.

### 5.8 Backups

- **Automático**: cron a las 23:59 (America/Guayaquil) vía `backup-service` Docker.
- **Manual**: front llama a `POST http://localhost:4000/api/backup` → el contenedor hace el snapshot y guarda en volumen `/backups`.
- El front usa `VITE_BACKUP_API_URL` (default `http://localhost:4000`) para conectarse.
- Metadata del backup se registra siempre en `public.backups`.

---

## 6. Convenciones de Código

### Servicios
- Un archivo por dominio en `src/services/`.
- Funciones siempre `async`, devuelven tipos concretos del `src/types/index.ts`.
- Toda mutación relevante llama a `auditService.log(currentUser, accion, entidad, id, detalles)`.
- Toda mutación que afecte circuitos o subcircuitos debe llamar a `recalculateStation`.

### Tipos
- Interfaces de dominio en `src/types/index.ts`.
- Constantes tipo enum en `src/types/enums.ts` como `const` objects (nunca TypeScript `enum`).
- Usar los tipos de `enums.ts` en lugar de strings literales cuando sea posible.

### Supabase
- Cliente anon: `src/config/supabaseClient.ts` → usar para operaciones de usuario.
- Cliente admin: `src/config/supabaseAdminClient.ts` → solo para operaciones de administración que requieren service role.
- Nunca usar la service role key en código que se ejecuta en el navegador para operaciones de auth.users; usar la Edge Function `admin-users`.

### Componentes
- Componentes agrupados por dominio en `src/components/{dominio}/`.
- El sidebar controla qué componente se renderiza (patrón switch en `DashboardPage.tsx`).
- Contextos disponibles: `AuthContext` (usuario), `SidebarContext` (navegación), `ThemeContext` (tema).

### Estaciones
- 26 estaciones: E01 (Villa El Salvador) → E26 (Bayóvar).
- Cada estación tiene exactamente **3 barras por defecto**: normal, emergency, continuity.
- `barService.createDefaultBars(stationId)` crea las 3 barras si aún no existen.

---

## 7. Variables de Entorno

### `frontend/.env`
```
VITE_SUPABASE_PROJECT_URL         ← URL del proyecto Supabase
VITE_SUPABASE_PROJECT_CLIENTID    ← anon key (pública, va al navegador)
VITE_SUPABASE_PROJECT_APPKEY      ← service role key (solo para supabaseAdminClient)
VITE_BACKUP_API_URL               ← URL del contenedor de backups (default: http://localhost:4000)
```

### `backup-service/.env`
```
SUPABASE_URL          ← URL del proyecto Supabase
SUPABASE_SERVICE_KEY  ← service role key (acceso completo)
BACKUP_DIR            ← /backups (volumen Docker)
CRON_SCHEDULE         ← expresión cron (default: "59 23 * * *")
PORT                  ← 4000
TZ                    ← America/Guayaquil
```

---

## 8. Reglas para Agentes de IA

1. **No romper `recalculateStation`**: cualquier cambio que afecte `md_kw` de circuitos o barras DEBE llamar a `recalculateStation` al final.
2. **No agregar features no solicitadas**: hacer solo lo pedido. No refactorizar código no tocado.
3. **Respetar el schema `"Subest"`**: no crear tablas en `public` directamente; crear en `"Subest"` y agregar la vista espejo en `supabase_views_public.sql`.
4. **Convención de email**: al crear usuarios en Supabase Auth usar `{username}@linea1metro.internal`.
5. **Tipos sin `enum` de TS**: usar `const` objects con `as const` tal como está en `enums.ts`.
6. **Auditoría**: toda operación de escritura significativa debe registrarse con `auditService.log`.
7. **No service role en el browser**: para mutaciones en `auth.users` (cambiar email, password, eliminar) delegar a la Edge Function `admin-users`.
8. **Los circuitos `inactive` no contribuyen a la demanda**: verificar este invariante en cualquier lógica de cálculo nueva.
9. **Factor 0.75 para emergency/continuity**: nunca aplicar factor 1.0 a barras de emergencia o continuidad.
10. **Supabase Storage**: el bucket `imagenes` ya existe; no intentar crearlo desde el cliente.
