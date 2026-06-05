/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_TEST_MODE?: string;
  readonly VITE_DEBUG_SUBS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
