---
name: linea1metro-gestión-energética
description: >
  Contexto de dominio completo para el sistema de gestión energética de la Línea 1 del Metro de Lima.
  Usa esta skill siempre que trabajes en este proyecto: al agregar features, corregir bugs, crear
  servicios, modificar cálculos eléctricos, ajustar el schema de Supabase, o tocar cualquier parte
  del frontend React/TS. Contiene las relaciones entre tablas, fórmulas de cálculo, flujos de negocio,
  convenciones de código y reglas de integridad que deben respetarse en toda modificación.
---

# Skill — Línea 1 Metro: Sistema de Gestión Energética

## Propósito

Este es un sistema de gestión de **subestaciones eléctricas** para la Línea 1 del Metro de Lima (Perú).
26 estaciones (E01–E26). El personal técnico monitorea potencia instalada, demanda máxima y
disponibilidad del transformador por estación, gestiona circuitos y tramita solicitudes de ampliación.

---

## Skills Complementarias

Esta skill cubre el dominio del negocio. Para guía técnica de implementación, consulta:

| Tipo de petición | Skill a usar |
|------------------|-------------|
| Código TypeScript: tipos, generics, patterns, tsconfig | `../skills/mastering-typescript/SKILL.md` |
| Componentes React, hooks, rendimiento, bundle | `../skills/react-best-practices/SKILL.md` |
| Lógica de dominio, cálculos, schema, servicios | **Esta skill** (SKILL.md del proyecto) |

---

- **Frontend**: React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4
- **BaaS**: Supabase (PostgreSQL + Auth + Storage)
- **Cliente DB**: `@supabase/supabase-js` v2 — sin backend intermedio
- **Extras**: recharts (gráficos), xlsx (exportar), lucide-react (iconos), react-router-dom 7
- **Backup service**: Microservicio Node.js/Express en Docker; cron diario 23:59 + API REST

---

## Mapa de Tablas y Relaciones

```
stations
  id, code (E01–E26), name, order_index
  transformer_capacity_kw   ← capacidad del transformador
  max_demand_kw             ← calculado: suma de demanda de barras activas
  available_power_kw        ← calculado: capacity - max_demand
  status                    ← calculado: red | yellow | green
  └─[CASCADE]─► bars
        id, station_id, name, bar_type (normal|emergency|continuity), status, capacity_kw, capacity_a
        └─[CASCADE]─► circuits
              id, bar_id, denomination, name, pi_kw, fd, md_kw, status
              secondary_bar_id, tertiary_bar_id  ← refs a otras barras (nullable)
              reserve_since, reserve_expires_at, client_last_contact, is_ups
              └─[CASCADE]─► sub_circuits
                    id, circuit_id, name, pi_kw, fd, md_kw, status
                    itm, mm2, reserve_since, reserve_expires_at

users  (UUID = Supabase Auth id)
  id (uuid), username, full_name, role (admin|opersac), status (active|inactive|reported)
  └─[CASCADE]─► permissions
        user_id, feature_key, is_allowed
  └──────────── requests
        opersac_user_id, station_id, bar_type, circuit_id (nullable)
        requested_load_kw, fd, requested_status, reserve_expires_at
        status (pending|approved|rejected), rejection_reason
        sub_circuit_name, sub_circuit_description, sub_circuit_itm, sub_circuit_mm2

observations  ← anotaciones técnicas sobre circuitos/subcircuitos/barras
  circuit_id, sub_circuit_id, bar_id  (SET NULL on delete)
  user_id, severity (urgent|warning|recommendation), content

notifications  ← alertas del sistema
  station_id, circuit_id  (SET NULL on delete)
  type (reserve_no_contact|negative_energy|request_pending|system)
  is_read, is_dismissed, extended_until

audit_logs     ← bitácora de toda mutación
backups        ← metadata de snapshots JSON generados por backup-service
```

> **Acceso DB**: Las tablas físicas están en schema `"Subest"`. PostgREST solo expone `public`.
> Existen vistas espejo en `public` para cada tabla. En código siempre `supabase.from('circuits')` etc.

---

## Fórmulas de Cálculo Eléctrico

Estas fórmulas son invariantes del dominio. No modificarlas sin justificación técnica explícita.

### Demanda máxima de un circuito
```
md_kw = pi_kw × fd
```
- `pi_kw`: potencia instalada (kW)
- `fd`: factor de demanda (0–1)

### Demanda de una barra
```
barra.md = Σ circuit.md_kw   [solo circuitos con status ≠ 'inactive']
```

### Factor por tipo de barra
| bar_type | factor |
|----------|--------|
| `normal` | 1.0 |
| `emergency` | **0.75** |
| `continuity` | **0.75** |

### Demanda y estado de la estación
```
station.max_demand_kw    = Σ (barra.md × factor)  [barras con status ≠ 'inactive']
station.available_power_kw = transformer_capacity_kw − max_demand_kw

status = 'red'    si max_demand_kw > transformer_capacity_kw
status = 'yellow' si available_power_kw / transformer_capacity_kw < 0.20
status = 'green'  en cualquier otro caso
```

**Función**: `recalculateStation(stationId)` en `src/utils/energyCalculator.ts`.
Debe llamarse tras cualquier INSERT/UPDATE/DELETE sobre `circuits` o `sub_circuits`.

---

## Estados de Circuitos y Subcircuitos

| status | Descripción | ¿Cuenta en demanda? |
|--------|-------------|---------------------|
| `operative_normal` | En operación | ✅ Sí |
| `reserve_r` | Reserva sin equipar | ✅ Sí |
| `reserve_equipped_re` | Reserva equipada | ✅ Sí |
| `inactive` | Fuera de servicio | ❌ No |

**Transiciones con efectos secundarios:**
- `→ inactive`: borrar `reserve_since` y `reserve_expires_at`
- `→ reserve_r / reserve_equipped_re`: asignar `reserve_since = hoy` si está vacío

---

## Flujo de Solicitudes de Ampliación

```
opersac crea LoadRequest (status='pending')
         ↓
admin aprueba o rechaza
         ↓ aprueba
¿circuit_id es null?
  Sí → crear Circuit nuevo en la barra bar_type de la estación
  No → crear SubCircuit dentro del circuit_id indicado
       ↓
respeta requested_status y reserve_expires_at del opersac
       ↓
recalculateStation(station_id)
       ↓
auditService.log(...)
```

Rechazo requiere `rejection_reason` obligatorio.

---

## Autenticación

- Supabase Auth con `signInWithPassword`.
- Email interno: `{username}@linea1metro.internal` (nunca emails reales).
- Tras login se consulta `public.users` para obtener rol y estado.
- Estados bloqueantes: `inactive` → "cuenta inactiva", `reported` → "cuenta reportada".
  En ambos casos: `supabase.auth.signOut()` inmediato.
- Permisos del `opersac` se cargan desde `public.permissions` y se colocan en `AuthContext.user.permissions`.

## Permiso Features (solo opersac)

```
view_stations     view_circuits     send_requests
add_observations  view_reports
```

Admins tienen acceso total. Verificar con `hasPermission(key)` del `AuthContext`.

---

## Notificaciones Automáticas

Generadas **en cliente** al iniciar sesión (`checkExpiringReserves()`), no hay cron:
- Detecta circuitos/subcircuitos con `reserve_expires_at ≤ hoy` y `status ≠ inactive/operative_normal`.
- Crea `notification` tipo `reserve_no_contact` evitando duplicados.

---

## Convenciones de Código

Para detalles completos consultar los archivos de skills especializados:

- **TypeScript** → [`.github/skills/typescript.md`](.github/skills/typescript.md)
  Tipos, interfaces, `const` objects vs `enum`, casteo de Supabase, estructura de servicios.
- **React** → [`.github/skills/react.md`](.github/skills/react.md)
  Contextos, navegación por sidebar, componentes UI, formularios, control de acceso.

### Resumen rápido de servicios
1. Archivo en `src/services/{dominio}Service.ts`.
2. Funciones `async`, retornan tipos de `src/types/index.ts`.
3. Toda mutación llama a `auditService.log(user, accion, entidad, id, detalles)`.
4. Toda mutación en circuitos/subcircuitos llama a `recalculateStation(stationId)`.

### Supabase
- `supabaseClient.ts` → anon key → uso general.
- `supabaseAdminClient.ts` → service role → solo operaciones admin.
- Para modificar `auth.users` → delegar a Edge Function `admin-users`.
- No llamar `supabase.storage.createBucket()` desde el cliente.

### Estaciones / Storage
- 26 estaciones, order_index 1–26; 3 barras por defecto por estación.
- Imágenes: rutas `{entityType}/{entityId}/current.{ext}`
  donde `entityType` ∈ `imagenes-unifilares | fotos-transformadores | imagenes-barras | imagenes-circuitos`.

---

## Archivos Clave a Consultar Antes de Modificar

| Archivo | Por qué leerlo |
|---------|---------------|
| `src/utils/energyCalculator.ts` | Toda la lógica de cálculo eléctrico |
| `src/types/index.ts` | Todas las interfaces de dominio y sus comentarios |
| `src/types/enums.ts` | Constantes de estados y tipos válidos |
| `sql/supabase_schema.sql` | DDL completo con constraints |
| `sql/supabase_views_public.sql` | Vistas espejo del schema public |
| `src/services/circuitService.ts` | Referencia de patrón completo para servicios |
| `src/services/requestService.ts` | Lógica de aprobación/rechazo con efectos secundarios |

---

## Reglas de Integridad — No Violar

1. `md_kw = pi_kw × fd` siempre. Si cambia `pi_kw` o `fd`, recalcular `md_kw`.
2. `inactive` nunca contribuye a la demanda. Sin excepciones.
3. Factor 0.75 para barras `emergency` y `continuity`. Factor 1.0 solo para `normal`.
4. `recalculateStation` después de cualquier cambio en carga de circuito/subcircuito.
5. Al aprobar una solicitud: respetar `requested_status` y `reserve_expires_at` del opersac.
6. La convención de email `@linea1metro.internal` es obligatoria para admitir login por username.
7. No crear tablas directamente en `public`; siempre en `"Subest"` + vista en `supabase_views_public.sql`.
