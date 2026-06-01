import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AideError } from '../errors.js';
import type { Logger } from '../logger.js';
import { silentLogger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DatabaseError extends AideError {
  constructor(message: string, opts?: { cause?: unknown; suggestion?: string }) {
    super({ message, code: 'AIDE_DB_ERROR', severity: 'fatal', recoverable: false, suggestion: opts?.suggestion, cause: opts?.cause as Error | undefined });
  }
}

export interface DbOptions { path: string; logger?: Logger; skipInit?: boolean; }

export function openDatabase(opts: DbOptions): DatabaseType {
  const log = opts.logger ?? silentLogger;
  let db: DatabaseType;
  try {
    db = new Database(opts.path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
  } catch (err) {
    throw new DatabaseError('Failed to open database at ' + opts.path, { cause: err, suggestion: 'Ensure the directory exists and is writable.' });
  }
  if (!opts.skipInit) {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (!fs.existsSync(schemaPath)) { db.close(); throw new DatabaseError('schema.sql not found at ' + schemaPath); }
      db.exec(fs.readFileSync(schemaPath, 'utf-8'));
      log.info('Database initialised', { path: opts.path });
    } catch (err) {
      db.close();
      throw err instanceof DatabaseError ? err : new DatabaseError('Failed to apply database schema', { cause: err });
    }
  }
  return db;
}

export function getSchemaVersion(db: DatabaseType): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_versions').get() as { v: number | null } | undefined;
  return row?.v ?? 0;
}
