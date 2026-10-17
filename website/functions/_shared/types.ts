// Minimal Pages Functions / D1 types so the project needs no workers-types dependency.
export interface D1Result<T = unknown> {
  results: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface Env {
  POLLS: D1Database;
  ASSETS: { fetch(input: Request | string | URL): Promise<Response> };
  VOTE_SALT: string;
}

export interface PagesContext {
  request: Request;
  env: Env;
}

export type PagesHandler = (context: PagesContext) => Response | Promise<Response>;
