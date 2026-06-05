/**
 * CodeShield - 数据库模块入口
 * 导出存储层、迁移框架和schema相关功能
 */

export { SQLiteStorage, createStorage } from '../storage/index.js';
export type { Storage, SQLiteStorageOptions } from '../storage/index.js';
export {
  CURRENT_SCHEMA_VERSION,
  getCurrentVersion,
  runMigrations,
  needsMigration,
  getPendingMigrations,
  getMigrationHistory,
} from './migrations.js';
