declare interface ImportMetaEnv {
  readonly VITE_SPREADSHEET_ID?: string;
  readonly VITE_SHEET_NAME?: string;
  readonly VITE_IP_SHEET_NAME?: string;
  readonly DEV?: boolean;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
