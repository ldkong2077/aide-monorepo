/**
 * CodeShield - 数据库迁移框架
 * 借鉴CodeGraph的迁移模式，支持schema版本追踪和增量迁移
 */

import Database from 'better-sqlite3';

/** 当前schema版本 */
export const CURRENT_SCHEMA_VERSION = 1;

/** 迁移定义 */
interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

/** 所有迁移列表（版本1由schema.sql处理） */
const migrations: Migration[] = [
  // 未来的迁移在此添加
  // {
  //   version: 2,
  //   description: 'Add xxx table',
  //   up: (db) => {
  //     db.exec(`CREATE TABLE IF NOT EXISTS ...`);
  //   },
  // },
];

/**
 * 获取数据库当前schema版本
 */
export function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db
      .prepare('SELECT MAX(version) as version FROM schema_versions')
      .get() as { version: number | null } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 记录已应用的迁移
 */
function recordMigration(db: Database.Database, version: number, description: string): void {
  db.prepare(
    'INSERT INTO schema_versions (version, applied_at, description) VALUES (?, ?, ?)'
  ).run(version, Date.now(), description);
}

/**
 * 执行所有待处理的迁移
 */
export function runMigrations(db: Database.Database, fromVersion: number): void {
  const pending = migrations.filter((m) => m.version > fromVersion);

  if (pending.length === 0) return;

  pending.sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    const transaction = db.transaction(() => {
      migration.up(db);
      recordMigration(db, migration.version, migration.description);
    });
    transaction();
  }
}

/**
 * 检查数据库是否需要迁移
 */
export function needsMigration(db: Database.Database): boolean {
  const current = getCurrentVersion(db);
  return current < CURRENT_SCHEMA_VERSION;
}

/**
 * 获取待处理的迁移列表
 */
export function getPendingMigrations(db: Database.Database): Migration[] {
  const current = getCurrentVersion(db);
  return migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);
}

/**
 * 获取迁移历史
 */
export function getMigrationHistory(
  db: Database.Database
): Array<{ version: number; appliedAt: number; description: string | null }> {
  try {
    const rows = db
      .prepare('SELECT version, applied_at, description FROM schema_versions ORDER BY version')
      .all() as Array<{ version: number; applied_at: number; description: string | null }>;

    return rows.map((row) => ({
      version: row.version,
      appliedAt: row.applied_at,
      description: row.description,
    }));
  } catch {
    return [];
  }
}
