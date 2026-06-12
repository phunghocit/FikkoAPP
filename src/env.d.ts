declare interface ImportMetaEnv {
  readonly VITE_SPREADSHEET_ID?: string;
  readonly VITE_SHEET_NAME?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
