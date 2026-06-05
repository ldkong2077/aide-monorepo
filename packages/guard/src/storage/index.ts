/**
 * CodeShield - SQLite 存储层
 * 使用 better-sqlite3 管理成本记录、路由日志、验证报告和模型性能数据
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  getCurrentVersion as getDbVersion,
  runMigrations as runDbMigrations,
} from '../db/migrations.js';
import type {
  CostRecord,
  CostSummary,
  RouteLog,
  VerificationReport,
  ModelPerformance,
  TaskType,
} from '../types.js';

// ==================== 存储接口 ====================

/** 存储层接口，供其他模块依赖注入 */
export interface Storage {
  recordCost(record: CostRecord): void;
  getCostSummary(period: 'today' | 'week' | 'month'): CostSummary;
  getCostByModel(): Record<string, number>;
  getCostByTask(): Record<string, number>;
  recordRouteLog(
    taskType: TaskType,
    fromModel: string,
    toModel: string,
    toProvider: string,
    latency: number,
    success: boolean,
  ): void;
  getRouteLogs(limit: number): RouteLog[];
  recordModelPerformance(
    provider: string,
    model: string,
    taskType: TaskType,
    success: boolean,
    latency: number,
  ): void;
  getModelPerformance(): ModelPerformance[];
  recordVerification(report: VerificationReport): void;
  getVerificationHistory(limit: number): VerificationReport[];
  addHallucinationRule(rule: {
    category: string;
    pattern: string;
    language?: string;
    severity?: string;
    message: string;
    suggestion?: string;
  }): void;
  getHallucinationRules(language?: string): {
    id: number;
    category: string;
    pattern: string;
    language: string;
    severity: string;
    message: string;
    suggestion: string | null;
  }[];
  addTrustedPackage(name: string, language?: string): void;
  getTrustedPackages(language?: string): string[];
  close(): void;
}

// ==================== SQLite 存储实现 ====================

/** SQLite 存储配置 */
export interface SQLiteStorageOptions {
  dbPath?: string;
  walMode?: boolean;
}

/**
 * SQLite 存储实现
 */
export class SQLiteStorage implements Storage {
  private db: Database.Database;

  constructor(options: SQLiteStorageOptions = {}) {
    // 默认路径优先使用 CODESHIELD_HOME 环境变量，然后是用户主目录，最后是当前工作目录
    let defaultBaseDir: string;
    if (process.env.CODESHIELD_HOME) {
      defaultBaseDir = process.env.CODESHIELD_HOME;
    } else {
      const homeDir = os.homedir();
      const homeDataDir = path.join(homeDir, '.codeshield', 'data');
      // 检查主目录是否可写（沙箱环境可能无法写入）
      try {
        if (!fs.existsSync(homeDataDir)) {
          fs.mkdirSync(homeDataDir, { recursive: true });
        }
        // 尝试在主目录创建临时文件验证可写性
        const testFile = path.join(homeDataDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        defaultBaseDir = path.join(homeDir, '.codeshield');
      } catch {
        // 主目录不可写，回退到当前工作目录
        defaultBaseDir = path.resolve(process.cwd(), 'data');
      }
    }
    const dbPath = options.dbPath || path.resolve(defaultBaseDir, 'data', 'codeshield.db');

    // 确保数据目录存在
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);

    // 启用 WAL 模式提升并发性能
    if (options.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    this.initializeTables();
  }

  /** 初始化数据库（使用schema.sql + 迁移框架） */
  private initializeTables(): void {
    const currentVersion = this.getCurrentSchemaVersion();

    if (currentVersion === 0) {
      // 全新数据库，执行schema.sql
      const schemaSql = this.loadSchemaSql();
      this.db.exec(schemaSql);
    }

    // 执行待处理的迁移
    runDbMigrations(this.db, currentVersion);
  }

  /** 获取当前schema版本 */
  private getCurrentSchemaVersion(): number {
    try {
      return getDbVersion(this.db);
    } catch {
      return 0;
    }
  }

  /** 加载schema.sql文件 */
  private loadSchemaSql(): string {
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      return fs.readFileSync(schemaPath, 'utf-8');
    }
    // 如果schema.sql不存在（开发模式），使用内联schema
    return this.getInlineSchema();
  }

  /** 内联schema（开发模式回退） */
  private getInlineSchema(): string {
    return `
      CREATE TABLE IF NOT EXISTS schema_versions (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        description TEXT
      );
      INSERT OR IGNORE INTO schema_versions (version, applied_at, description)
      VALUES (1, 0, 'Initial schema');
      CREATE TABLE IF NOT EXISTS cost_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        task_type TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS route_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        task_type TEXT NOT NULL,
        from_model TEXT NOT NULL,
        to_model TEXT NOT NULL,
        to_provider TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        cost_usd REAL NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS verification_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        files_checked TEXT NOT NULL,
        diff_result TEXT NOT NULL,
        hallucinations TEXT NOT NULL,
        confidence TEXT NOT NULL,
        test_result TEXT
      );
      CREATE TABLE IF NOT EXISTS model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        task_type TEXT NOT NULL,
        total_requests INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        avg_latency_ms REAL NOT NULL DEFAULT 0,
        last_used INTEGER NOT NULL,
        UNIQUE(provider, model, task_type)
      );
      CREATE TABLE IF NOT EXISTS hallucination_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        pattern TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'any',
        severity TEXT NOT NULL DEFAULT 'medium',
        message TEXT NOT NULL,
        suggestion TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trusted_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'any',
        source TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL,
        UNIQUE(name, language)
      );
      CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_records(timestamp);
      CREATE INDEX IF NOT EXISTS idx_cost_model ON cost_records(model);
      CREATE INDEX IF NOT EXISTS idx_cost_task ON cost_records(task_type);
      CREATE INDEX IF NOT EXISTS idx_route_timestamp ON route_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_perf_lookup ON model_performance(provider, model, task_type);
      CREATE INDEX IF NOT EXISTS idx_rules_category ON hallucination_rules(category);
      CREATE INDEX IF NOT EXISTS idx_rules_language ON hallucination_rules(language);
      CREATE INDEX IF NOT EXISTS idx_trusted_pkg_name ON trusted_packages(name);
      CREATE VIRTUAL TABLE IF NOT EXISTS verification_fts USING fts5(
        id,
        files_checked,
        hallucinations,
        confidence_summary,
        content='verification_reports',
        content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS verification_ai AFTER INSERT ON verification_reports BEGIN
        INSERT INTO verification_fts(rowid, id, files_checked, hallucinations, confidence_summary)
        VALUES (NEW.rowid, NEW.id, NEW.files_checked, NEW.hallucinations, NEW.confidence);
      END;
      CREATE TRIGGER IF NOT EXISTS verification_ad AFTER DELETE ON verification_reports BEGIN
        INSERT INTO verification_fts(verification_fts, rowid, id, files_checked, hallucinations, confidence_summary)
        VALUES ('delete', OLD.rowid, OLD.id, OLD.files_checked, OLD.hallucinations, OLD.confidence);
      END;
      CREATE TRIGGER IF NOT EXISTS verification_au AFTER UPDATE ON verification_reports BEGIN
        INSERT INTO verification_fts(verification_fts, rowid, id, files_checked, hallucinations, confidence_summary)
        VALUES ('delete', OLD.rowid, OLD.id, OLD.files_checked, OLD.hallucinations, OLD.confidence);
        INSERT INTO verification_fts(rowid, id, files_checked, hallucinations, confidence_summary)
        VALUES (NEW.rowid, NEW.id, NEW.files_checked, NEW.hallucinations, NEW.confidence);
      END;
      CREATE VIRTUAL TABLE IF NOT EXISTS rules_fts USING fts5(
        id,
        category,
        pattern,
        message,
        content='hallucination_rules',
        content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS rules_ai AFTER INSERT ON hallucination_rules BEGIN
        INSERT INTO rules_fts(rowid, id, category, pattern, message)
        VALUES (NEW.rowid, NEW.id, NEW.category, NEW.pattern, NEW.message);
      END;
      CREATE TRIGGER IF NOT EXISTS rules_ad AFTER DELETE ON hallucination_rules BEGIN
        INSERT INTO rules_fts(rules_fts, rowid, id, category, pattern, message)
        VALUES ('delete', OLD.rowid, OLD.id, OLD.category, OLD.pattern, OLD.message);
      END;
      CREATE TRIGGER IF NOT EXISTS rules_au AFTER UPDATE ON hallucination_rules BEGIN
        INSERT INTO rules_fts(rules_fts, rowid, id, category, pattern, message)
        VALUES ('delete', OLD.rowid, OLD.id, OLD.category, OLD.pattern, OLD.message);
        INSERT INTO rules_fts(rowid, id, category, pattern, message)
        VALUES (NEW.rowid, NEW.id, NEW.category, NEW.pattern, NEW.message);
      END;
    `;
  }

  // ==================== 成本记录 ====================

  /** 记录一次成本 */
  recordCost(record: CostRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO cost_records (timestamp, provider, model, task_type, input_tokens, output_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.timestamp,
      record.provider,
      record.model,
      record.task_type,
      record.input_tokens,
      record.output_tokens,
      record.cost_usd,
    );
  }

  /** 获取成本汇总 */
  getCostSummary(period: 'today' | 'week' | 'month'): CostSummary {
    const since = this.getPeriodStart(period);

    const totalRow = this.db
      .prepare(
        `
      SELECT
        COALESCE(SUM(cost_usd), 0) as total_usd,
        COUNT(*) as request_count
      FROM cost_records
      WHERE timestamp >= ?
    `,
      )
      .get(since) as { total_usd: number; request_count: number };

    const byModelRows = this.db
      .prepare(
        `
      SELECT model, COALESCE(SUM(cost_usd), 0) as total
      FROM cost_records
      WHERE timestamp >= ?
      GROUP BY model
    `,
      )
      .all(since) as { model: string; total: number }[];

    const byTaskRows = this.db
      .prepare(
        `
      SELECT task_type, COALESCE(SUM(cost_usd), 0) as total
      FROM cost_records
      WHERE timestamp >= ?
      GROUP BY task_type
    `,
      )
      .all(since) as { task_type: string; total: number }[];

    const byProviderRows = this.db
      .prepare(
        `
      SELECT provider, COALESCE(SUM(cost_usd), 0) as total
      FROM cost_records
      WHERE timestamp >= ?
      GROUP BY provider
    `,
      )
      .all(since) as { provider: string; total: number }[];

    const byModel: Record<string, number> = {};
    for (const row of byModelRows) {
      byModel[row.model] = row.total;
    }

    const byTask: Record<string, number> = {};
    for (const row of byTaskRows) {
      byTask[row.task_type] = row.total;
    }

    const byProvider: Record<string, number> = {};
    for (const row of byProviderRows) {
      byProvider[row.provider] = row.total;
    }

    return {
      period,
      total_usd: totalRow.total_usd,
      by_model: byModel,
      by_task: byTask,
      by_provider: byProvider,
      request_count: totalRow.request_count,
    };
  }

  /** 按模型获取成本 */
  getCostByModel(): Record<string, number> {
    const rows = this.db
      .prepare(
        `
      SELECT model, COALESCE(SUM(cost_usd), 0) as total
      FROM cost_records
      GROUP BY model
    `,
      )
      .all() as { model: string; total: number }[];

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.model] = row.total;
    }
    return result;
  }

  /** 按任务类型获取成本 */
  getCostByTask(): Record<string, number> {
    const rows = this.db
      .prepare(
        `
      SELECT task_type, COALESCE(SUM(cost_usd), 0) as total
      FROM cost_records
      GROUP BY task_type
    `,
      )
      .all() as { task_type: string; total: number }[];

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.task_type] = row.total;
    }
    return result;
  }

  // ==================== 路由日志 ====================

  /** 记录路由日志 */
  recordRouteLog(
    taskType: TaskType,
    fromModel: string,
    toModel: string,
    toProvider: string,
    latency: number,
    success: boolean,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO route_logs (timestamp, task_type, from_model, to_model, to_provider, latency_ms, success)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(Date.now(), taskType, fromModel, toModel, toProvider, latency, success ? 1 : 0);
  }

  /** 获取路由日志 */
  getRouteLogs(limit: number): RouteLog[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM route_logs ORDER BY timestamp DESC LIMIT ?
    `,
      )
      .all(limit) as {
      id: number;
      timestamp: number;
      task_type: string;
      from_model: string;
      to_model: string;
      to_provider: string;
      latency_ms: number;
      success: number;
      cost_usd: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      task_type: row.task_type as TaskType,
      from_model: row.from_model,
      to_model: row.to_model,
      to_provider: row.to_provider,
      latency_ms: row.latency_ms,
      success: row.success === 1,
      cost_usd: row.cost_usd,
    }));
  }

  // ==================== 模型性能 ====================

  /** 记录模型性能 */
  recordModelPerformance(
    provider: string,
    model: string,
    taskType: TaskType,
    success: boolean,
    latency: number,
  ): void {
    // 使用 UPSERT 更新或插入
    const stmt = this.db.prepare(`
      INSERT INTO model_performance (provider, model, task_type, total_requests, success_count, avg_latency_ms, last_used)
      VALUES (?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(provider, model, task_type)
      DO UPDATE SET
        total_requests = total_requests + 1,
        success_count = success_count + ?,
        avg_latency_ms = (avg_latency_ms * (total_requests - 1) + ?) / total_requests,
        last_used = ?
    `);
    stmt.run(
      provider,
      model,
      taskType,
      success ? 1 : 0,
      latency,
      Date.now(),
      success ? 1 : 0,
      latency,
      Date.now(),
    );
  }

  /** 获取模型性能数据 */
  getModelPerformance(): ModelPerformance[] {
    const rows = this.db
      .prepare(
        `
      SELECT provider, model, task_type, total_requests, success_count, avg_latency_ms, last_used
      FROM model_performance
      ORDER BY last_used DESC
    `,
      )
      .all() as {
      provider: string;
      model: string;
      task_type: string;
      total_requests: number;
      success_count: number;
      avg_latency_ms: number;
      last_used: number;
    }[];

    return rows.map((row) => ({
      provider: row.provider,
      model: row.model,
      task_type: row.task_type as TaskType,
      total_requests: row.total_requests,
      success_count: row.success_count,
      avg_latency_ms: row.avg_latency_ms,
      last_used: row.last_used,
    }));
  }

  // ==================== 验证报告 ====================

  /** 记录验证报告 */
  recordVerification(report: VerificationReport): void {
    const stmt = this.db.prepare(`
      INSERT INTO verification_reports (timestamp, files_checked, diff_result, hallucinations, confidence, test_result)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      report.timestamp,
      JSON.stringify(report.files_checked),
      JSON.stringify(report.diffResults),
      JSON.stringify(report.hallucinations),
      JSON.stringify(report.confidence),
      report.testResult ? JSON.stringify(report.testResult) : null,
    );
  }

  /** 获取验证历史 */
  getVerificationHistory(limit: number): VerificationReport[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM verification_reports ORDER BY timestamp DESC LIMIT ?
    `,
      )
      .all(limit) as {
      id: number;
      timestamp: number;
      files_checked: string;
      diff_result: string;
      hallucinations: string;
      confidence: string;
      test_result: string | null;
    }[];

    return rows.map((row) => ({
      timestamp: row.timestamp,
      files_checked: JSON.parse(row.files_checked),
      diffResults: JSON.parse(row.diff_result),
      hallucinations: JSON.parse(row.hallucinations),
      confidence: JSON.parse(row.confidence),
      testResult: row.test_result ? JSON.parse(row.test_result) : null,
      summary: '',
    }));
  }

  // ==================== 幻觉规则管理 ====================

  /** 验证正则表达式模式 */
  private validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
    // 长度限制
    if (pattern.length > 1000) {
      return { valid: false, error: 'Pattern too long (max 1000 chars)' };
    }

    // 检测嵌套量词（ReDoS 风险）
    const nestedQuantifiers = /(\+|\*|\{[0-9]+,?\})\s*\)/;
    if (nestedQuantifiers.test(pattern)) {
      return { valid: false, error: 'Nested quantifiers detected (ReDoS risk)' };
    }

    // 检测回溯引用
    const backreferences = /\\[1-9]/;
    if (backreferences.test(pattern)) {
      return { valid: false, error: 'Backreferences not allowed' };
    }

    // 尝试编译正则表达式
    try {
      new RegExp(pattern);
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        error: `Invalid regex: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  /** 验证幻觉规则 */
  private validateHallucinationRule(rule: {
    category: string;
    pattern: string;
    language?: string;
    severity?: string;
    message: string;
    suggestion?: string;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证类别
    if (!rule.category || rule.category.length < 3) {
      errors.push('Category must be at least 3 characters');
    }

    // 验证模式
    if (!rule.pattern) {
      errors.push('Pattern is required');
    } else {
      const patternValidation = this.validateRegexPattern(rule.pattern);
      if (!patternValidation.valid) {
        errors.push(`Pattern: ${patternValidation.error}`);
      }
    }

    // 验证语言
    const validLanguages = [
      'any',
      'typescript',
      'javascript',
      'python',
      'go',
      'rust',
      'java',
      'c',
      'cpp',
    ];
    if (rule.language && !validLanguages.includes(rule.language)) {
      errors.push(
        `Invalid language: ${rule.language}. Must be one of: ${validLanguages.join(', ')}`,
      );
    }

    // 验证严重程度
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (rule.severity && !validSeverities.includes(rule.severity)) {
      errors.push(
        `Invalid severity: ${rule.severity}. Must be one of: ${validSeverities.join(', ')}`,
      );
    }

    // 验证消息
    if (!rule.message || rule.message.length < 10) {
      errors.push('Message must be at least 10 characters');
    }

    return { valid: errors.length === 0, errors };
  }

  /** 添加自定义幻觉检测规则 */
  addHallucinationRule(rule: {
    category: string;
    pattern: string;
    language?: string;
    severity?: string;
    message: string;
    suggestion?: string;
  }): void {
    // 验证规则
    const validation = this.validateHallucinationRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.errors.join('; ')}`);
    }

    const stmt = this.db.prepare(`
      INSERT INTO hallucination_rules (category, pattern, language, severity, message, suggestion, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    stmt.run(
      rule.category,
      rule.pattern,
      rule.language || 'any',
      rule.severity || 'medium',
      rule.message,
      rule.suggestion || null,
      now,
      now,
    );
  }

  /** 获取所有启用的幻觉检测规则 */
  getHallucinationRules(language?: string): {
    id: number;
    category: string;
    pattern: string;
    language: string;
    severity: string;
    message: string;
    suggestion: string | null;
  }[] {
    if (language && language !== 'any') {
      return this.db
        .prepare(
          'SELECT * FROM hallucination_rules WHERE enabled = 1 AND (language = ? OR language = ?) ORDER BY category',
        )
        .all(language, 'any') as {
        id: number;
        category: string;
        pattern: string;
        language: string;
        severity: string;
        message: string;
        suggestion: string | null;
      }[];
    }
    return this.db
      .prepare('SELECT * FROM hallucination_rules WHERE enabled = 1 ORDER BY category')
      .all() as {
      id: number;
      category: string;
      pattern: string;
      language: string;
      severity: string;
      message: string;
      suggestion: string | null;
    }[];
  }

  /** 搜索幻觉规则（使用FTS5） */
  searchHallucinationRules(query: string): {
    id: number;
    category: string;
    pattern: string;
    message: string;
  }[] {
    try {
      const safeQuery = this.escapeFTS5Query(query);
      return this.db
        .prepare(
          `
        SELECT r.id, r.category, r.pattern, r.message
        FROM hallucination_rules r
        JOIN rules_fts f ON r.rowid = f.rowid
        WHERE rules_fts MATCH ? AND r.enabled = 1
        ORDER BY rank
        LIMIT 20
      `,
        )
        .all(safeQuery) as {
        id: number;
        category: string;
        pattern: string;
        message: string;
      }[];
    } catch {
      return [];
    }
  }

  // ==================== 可信包管理 ====================

  /** 添加可信包 */
  addTrustedPackage(name: string, language = 'any'): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO trusted_packages (name, language, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(name, language, Date.now());
  }

  /** 获取所有可信包 */
  getTrustedPackages(language?: string): string[] {
    if (language && language !== 'any') {
      const rows = this.db
        .prepare('SELECT name FROM trusted_packages WHERE language = ? OR language = ?')
        .all(language, 'any') as { name: string }[];
      return rows.map((r) => r.name);
    }
    const rows = this.db.prepare('SELECT name FROM trusted_packages').all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  /** 移除可信包 */
  removeTrustedPackage(name: string, language = 'any'): void {
    this.db
      .prepare('DELETE FROM trusted_packages WHERE name = ? AND language = ?')
      .run(name, language);
  }

  // ==================== FTS5 搜索 ====================

  /** 搜索验证报告（使用FTS5全文搜索） */
  searchVerificationReports(
    query: string,
    limit = 20,
  ): {
    id: number;
    timestamp: number;
    files_checked: string;
  }[] {
    try {
      const safeQuery = this.escapeFTS5Query(query);
      return this.db
        .prepare(
          `
        SELECT v.id, v.timestamp, v.files_checked
        FROM verification_reports v
        JOIN verification_fts f ON v.rowid = f.rowid
        WHERE verification_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
        )
        .all(safeQuery, limit) as {
        id: number;
        timestamp: number;
        files_checked: string;
      }[];
    } catch {
      return [];
    }
  }

  // ==================== 工具方法 ====================

  private escapeFTS5Query(query: string): string {
    return query.replace(/["*]/g, '').replace(/\b(AND|OR|NOT|NEAR)\b/gi, '');
  }

  /** 获取时间段起始时间戳 */
  private getPeriodStart(period: 'today' | 'week' | 'month'): number {
    const now = new Date();
    switch (period) {
      case 'today': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return start.getTime();
      }
      case 'week': {
        const dayOfWeek = now.getDay() || 7; // 周日为7
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
        return start.getTime();
      }
      case 'month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return start.getTime();
      }
    }
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}

/**
 * 创建存储实例
 */
export function createStorage(options?: SQLiteStorageOptions): Storage {
  return new SQLiteStorage(options);
}
