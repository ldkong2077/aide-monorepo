/**
 * 数据库Schema和迁移框架测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  CURRENT_SCHEMA_VERSION,
  getCurrentVersion,
  runMigrations,
  needsMigration,
  getMigrationHistory,
} from "../db/migrations.js";

describe("数据库迁移框架", () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeshield-test-"));
    db = new Database(path.join(tmpDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getCurrentVersion", () => {
    it("空数据库返回版本0", () => {
      expect(getCurrentVersion(db)).toBe(0);
    });

    it("有schema_versions表时返回正确版本", () => {
      db.exec(`
        CREATE TABLE schema_versions (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );
        INSERT INTO schema_versions (version, applied_at, description)
        VALUES (1, ${Date.now()}, 'Initial schema');
      `);
      expect(getCurrentVersion(db)).toBe(1);
    });
  });

  describe("runMigrations", () => {
    it("无待处理迁移时不做任何操作", () => {
      db.exec(`
        CREATE TABLE schema_versions (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );
        INSERT INTO schema_versions (version, applied_at, description)
        VALUES (${CURRENT_SCHEMA_VERSION}, ${Date.now()}, 'Current');
      `);

      const before = getCurrentVersion(db);
      runMigrations(db, before);
      expect(getCurrentVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    });

    it("从版本0开始不报错", () => {
      expect(() => runMigrations(db, 0)).not.toThrow();
    });
  });

  describe("needsMigration", () => {
    it("空数据库需要迁移", () => {
      expect(needsMigration(db)).toBe(true);
    });

    it("当前版本不需要迁移", () => {
      db.exec(`
        CREATE TABLE schema_versions (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );
        INSERT INTO schema_versions (version, applied_at, description)
        VALUES (${CURRENT_SCHEMA_VERSION}, ${Date.now()}, 'Current');
      `);
      expect(needsMigration(db)).toBe(false);
    });
  });

  describe("getMigrationHistory", () => {
    it("空数据库返回空历史", () => {
      const history = getMigrationHistory(db);
      expect(history).toEqual([]);
    });

    it("返回正确的迁移历史", () => {
      db.exec(`
        CREATE TABLE schema_versions (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );
        INSERT INTO schema_versions (version, applied_at, description)
        VALUES (1, 1000, 'Initial');
      `);
      const history = getMigrationHistory(db);
      expect(history).toHaveLength(1);
      expect(history[0].version).toBe(1);
      expect(history[0].description).toBe("Initial");
    });
  });
});

describe("Schema SQL完整性", () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeshield-schema-"));
    db = new Database(path.join(tmpDir, "schema-test.db"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("schema.sql可以成功执行", () => {
    const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
    if (!fs.existsSync(schemaPath)) {
      // schema.sql可能不在dist目录，跳过
      return;
    }
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    expect(() => db.exec(schemaSql)).not.toThrow();
  });

  it("所有必需的表都存在", () => {
    const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
    if (!fs.existsSync(schemaPath)) return;

    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schemaSql);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r: { name: string }) => r.name);

    expect(tables).toContain("schema_versions");
    expect(tables).toContain("cost_records");
    expect(tables).toContain("route_logs");
    expect(tables).toContain("verification_reports");
    expect(tables).toContain("model_performance");
    expect(tables).toContain("hallucination_rules");
    expect(tables).toContain("trusted_packages");
  });

  it("FTS5虚拟表存在", () => {
    const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
    if (!fs.existsSync(schemaPath)) return;

    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schemaSql);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r: { name: string }) => r.name);

    expect(tables).toContain("verification_fts");
    expect(tables).toContain("rules_fts");
  });

  it("FTS5触发器存在", () => {
    const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
    if (!fs.existsSync(schemaPath)) return;

    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schemaSql);

    const triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name",
      )
      .all()
      .map((r: { name: string }) => r.name);

    expect(triggers).toContain("verification_ai");
    expect(triggers).toContain("verification_ad");
    expect(triggers).toContain("verification_au");
    expect(triggers).toContain("rules_ai");
    expect(triggers).toContain("rules_ad");
    expect(triggers).toContain("rules_au");
  });
});
