-- CodeShield SQLite Schema
-- Version 1

-- Schema version tracking (borrowed from CodeGraph pattern)
CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL,
    description TEXT
);

INSERT OR IGNORE INTO schema_versions (version, applied_at, description)
VALUES (1, strftime('%s', 'now') * 1000, 'Initial schema');

-- Cost records
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

-- Route logs
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

-- Verification reports
CREATE TABLE IF NOT EXISTS verification_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    files_checked TEXT NOT NULL,
    diff_result TEXT NOT NULL,
    hallucinations TEXT NOT NULL,
    confidence TEXT NOT NULL,
    test_result TEXT
);

-- Model performance
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

-- Hallucination rules (new table for custom detection rules)
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

-- Trusted packages (new table for project-specific trusted packages)
CREATE TABLE IF NOT EXISTS trusted_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'any',
    source TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    UNIQUE(name, language)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_cost_model ON cost_records(model);
CREATE INDEX IF NOT EXISTS idx_cost_task ON cost_records(task_type);
CREATE INDEX IF NOT EXISTS idx_route_timestamp ON route_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_perf_lookup ON model_performance(provider, model, task_type);
CREATE INDEX IF NOT EXISTS idx_rules_category ON hallucination_rules(category);
CREATE INDEX IF NOT EXISTS idx_rules_language ON hallucination_rules(language);
CREATE INDEX IF NOT EXISTS idx_trusted_pkg_name ON trusted_packages(name);

-- FTS5 full-text search on verification reports (borrowed from CodeGraph)
CREATE VIRTUAL TABLE IF NOT EXISTS verification_fts USING fts5(
    id,
    files_checked,
    hallucinations,
    confidence_summary,
    content='verification_reports',
    content_rowid='rowid'
);

-- FTS5 triggers to keep index in sync (borrowed from CodeGraph pattern)
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

-- FTS5 on hallucination rules
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
