# Reglas de Migración para este Proyecto
- **Origen**: FastAPI (Carpeta `/app`).
- **Destino**: React + TypeScript + Supabase.
- **Acción**: Al migrar de `/app/services`, convertir la lógica de Python a funciones asíncronas en TS usando `@supabase/supabase-js`.
- **Tipado**: Usar los esquemas de `/app/schemas` para definir las interfaces iniciales en TS.
