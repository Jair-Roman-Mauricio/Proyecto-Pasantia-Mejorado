/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_PROJECT_URL: string;
  readonly VITE_SUPABASE_PROJECT_CLIENTID: string;
  readonly VITE_SUPABASE_PROJECT_APPKEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
