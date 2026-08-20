declare interface ImportMetaEnv {
  readonly VITE_APPSCRIPT_URL?: string;
  readonly DEV?: boolean;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
