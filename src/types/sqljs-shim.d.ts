/**
 * Minimal local type shim for the `sql.js` API surface this app actually uses.
 *
 * Deliberately NOT using the official `@types/sql.js` package — it triple-slash
 * references `@types/emscripten`, adding one more dependency edge for no real gain
 * here. This shim covers only `initSqlJs`/`Database`/`Statement` methods actually
 * called in `src/lib/anki/ankiParser.ts`.
 */
declare module 'sql.js' {
  export type SqlValue = number | string | Uint8Array | null;
  export type ParamsObject = Record<string, SqlValue>;
  export type BindParams = SqlValue[] | ParamsObject | null;

  export class Statement {
    step(): boolean;
    getAsObject(params?: BindParams): ParamsObject;
    free(): boolean;
  }

  export class Database {
    constructor(data?: Uint8Array | null);
    exec(sql: string, params?: BindParams): Array<{ columns: string[]; values: SqlValue[][] }>;
    prepare(sql: string, params?: BindParams): Statement;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
    Statement: typeof Statement;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
