/**
 * CodeGuard - 主验证引擎
 * 编排所有检查流程，生成完整的验证报告
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);
import { HallucinationDetector } from './hallucination.js';
import { ASTDiffAnalyzer } from './ast-diff.js';
import { ConfidenceScorer } from './confidence.js';
import { TestRunner } from './test-runner.js';
import { ContextBuilder, countProjectFiles } from './context.js';
import type {
  VerifyOptions,
  VerificationReport,
  DiffResult,
  HallucinationReport,
  TestResult,
  Language,
} from '../types.js';
import type { Storage } from '../storage/index.js';

// Local logger sink for verifier-level warnings. This is the ONE place in
// @aide/guard that writes to console directly — every other module should
// import `logWarn` from a shared helper instead.
 
const logger = {
  warn: (msg: string, err?: unknown) =>
    console.warn(`[CodeGuard] ${msg}`, err instanceof Error ? err.message : ''),
};
 

/**
 * 主验证引擎
 * 协调幻觉检测、AST差异分析、测试运行和置信度评分
 */
export class Verifier {
  private hallucinationDetector: HallucinationDetector;
  private astDiffAnalyzer: ASTDiffAnalyzer;
  private confidenceScorer: ConfidenceScorer;
  private testRunner: TestRunner;
  private storage?: Storage;

  constructor(storage?: Storage) {
    this.storage = storage;
    this.hallucinationDetector = new HallucinationDetector(storage);
    this.astDiffAnalyzer = new ASTDiffAnalyzer();
    this.confidenceScorer = new ConfidenceScorer();
    this.testRunner = new TestRunner();
  }

  /**
   * 执行验证
   * 根据选项验证文件、目录或git差异
   */
  async verify(options: VerifyOptions): Promise<VerificationReport> {
    // 根据选项确定验证方式
    if (options.diff) {
      return this.verifyDiff(options.diff.base, options.diff.head);
    }

    if (options.staged) {
      return this.verifyStaged(options);
    }

    if (options.file) {
      return this.verifyFile(options.file, options);
    }

    if (options.path) {
      return this.verifyPath(options.path, options);
    }

    // 默认验证当前目录
    return this.verifyPath('.', options);
  }

  /**
   * 验证git diff之间的差异
   */
  async verifyDiff(
    base: string,
    head: string,
    options?: VerifyOptions,
  ): Promise<VerificationReport> {
    const projectDir = this.findProjectRoot();
    const diffResults: DiffResult[] = [];
    const hallucinations: HallucinationReport[] = [];

    // 获取差异文件列表
    const diffFiles = await this.getDiffFiles(base, head, projectDir);

    for (const filePath of diffFiles) {
      try {
        const beforeContent = await this.getFileAtCommit(filePath, base, projectDir);
        const afterContent = await this.getFileAtCommit(filePath, head, projectDir);

        // 步骤2: AST差异分析
        const diffResult = this.astDiffAnalyzer.analyzeDiff(beforeContent, afterContent, filePath);
        diffResults.push(diffResult);

        // 步骤3: 幻觉检测（只检测新代码）
        const language = this.detectLanguage(filePath);
        const newCodeHalls = this.hallucinationDetector.detect(afterContent, language, projectDir);
        hallucinations.push(...newCodeHalls);
      } catch (err) {
        // 文件可能不存在于某个提交中（新增/删除），跳过
        logger.warn('获取diff文件内容失败，跳过', err);
      }
    }

    // 步骤4: 运行测试
    let testResult: TestResult | undefined;
    if (!options?.noTest) {
      testResult = await this.runTestsForFiles(diffFiles, projectDir);
    }

    // 步骤5: 计算置信度
    const confidence = this.confidenceScorer.computeScore(diffResults, hallucinations, testResult);

    // 步骤6: 生成报告
    const report = this.generateReport({
      id: this.generateReportId(),
      timestamp: Date.now(),
      options: { diff: { base, head }, ...options },
      files_checked: diffFiles,
      diffResults,
      hallucinations,
      testResult,
      confidence,
      summary: '',
    });

    // 记录验证报告到存储
    if (this.storage) {
      this.storage.recordVerification(report);
    }

    return report;
  }

  /**
   * 验证单个文件
   */
  async verifyFile(filePath: string, options?: VerifyOptions): Promise<VerificationReport> {
    const projectDir = this.findProjectRoot();
    const absolutePath = path.resolve(projectDir, filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`文件不存在: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const language = this.detectLanguage(filePath);
    const diffResults: DiffResult[] = [];
    const hallucinations: HallucinationReport[] = [];

    // 对单文件进行幻觉检测
    const detected = this.hallucinationDetector.detect(content, language, projectDir);
    hallucinations.push(...detected);

    // 如果有git，与上一个版本对比
    try {
      const beforeContent = await this.getFileAtCommit(filePath, 'HEAD', projectDir);
      if (beforeContent !== content) {
        const diffResult = this.astDiffAnalyzer.analyzeDiff(beforeContent, content, filePath);
        diffResults.push(diffResult);
      }
    } catch (err) {
      // 没有git历史，跳过差异分析
      logger.warn('没有git历史，跳过差异分析', err);
    }

    // 运行相关测试
    let testResult: TestResult | undefined;
    if (!options?.noTest) {
      testResult = await this.testRunner.runAffectedTests(filePath, projectDir);
    }

    // 计算置信度
    const confidence = this.confidenceScorer.computeScore(diffResults, hallucinations, testResult);

    const report = this.generateReport({
      id: this.generateReportId(),
      timestamp: Date.now(),
      options: { file: filePath, ...options },
      files_checked: [filePath],
      diffResults,
      hallucinations,
      testResult,
      confidence,
      summary: '',
    });

    if (this.storage) {
      this.storage.recordVerification(report);
    }

    return report;
  }

  /**
   * 验证暂存区变更
   */
  async verifyStaged(options?: VerifyOptions): Promise<VerificationReport> {
    const projectDir = this.findProjectRoot();
    const diffResults: DiffResult[] = [];
    const hallucinations: HallucinationReport[] = [];

    // 获取暂存区差异
    const stagedFiles = await this.getStagedFiles(projectDir);

    for (const filePath of stagedFiles) {
      try {
        const beforeContent = await this.getStagedFileBefore(filePath, projectDir);
        const afterContent = await this.getStagedFileAfter(filePath, projectDir);

        if (beforeContent === null || afterContent === null) continue;

        // AST差异分析
        const diffResult = this.astDiffAnalyzer.analyzeDiff(beforeContent, afterContent, filePath);
        diffResults.push(diffResult);

        // 幻觉检测
        const language = this.detectLanguage(filePath);
        const detected = this.hallucinationDetector.detect(afterContent, language, projectDir);
        hallucinations.push(...detected);
      } catch (err) {
        // 跳过无法处理的文件
        logger.warn('跳过无法处理的暂存文件', err);
      }
    }

    // 运行测试
    let testResult: TestResult | undefined;
    if (!options?.noTest) {
      testResult = await this.runTestsForFiles(stagedFiles, projectDir);
    }

    // 计算置信度
    const confidence = this.confidenceScorer.computeScore(diffResults, hallucinations, testResult);

    const report = this.generateReport({
      id: this.generateReportId(),
      timestamp: Date.now(),
      options: { staged: true, ...options },
      files_checked: stagedFiles,
      diffResults,
      hallucinations,
      testResult,
      confidence,
      summary: '',
    });

    if (this.storage) {
      this.storage.recordVerification(report);
    }

    return report;
  }

  /**
   * 验证指定路径
   */
  private async verifyPath(
    targetPath: string,
    options?: VerifyOptions,
  ): Promise<VerificationReport> {
    const projectDir = this.findProjectRoot();
    const absolutePath = path.resolve(projectDir, targetPath);
    const diffResults: DiffResult[] = [];
    const hallucinations: HallucinationReport[] = [];

    const files = this.collectFiles(absolutePath);

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const language = this.detectLanguage(filePath);

        // 幻觉检测
        const detected = this.hallucinationDetector.detect(content, language, projectDir);
        hallucinations.push(...detected);

        // 差异分析：与 git 上一版本对比（如果有 git 历史）
        try {
          const relativePath = path.relative(projectDir, filePath);
          const beforeContent = await this.getFileAtCommit(relativePath, 'HEAD', projectDir);
          if (beforeContent && beforeContent !== content) {
            const diffResult = this.astDiffAnalyzer.analyzeDiff(
              beforeContent,
              content,
              relativePath,
            );
            diffResults.push(diffResult);
          }
        } catch {
          // 没有 git 历史，跳过差异分析
        }
      } catch (err) {
        // 跳过无法读取的文件
        logger.warn('跳过无法读取的文件', err);
      }
    }

    // 运行测试
    let testResult: TestResult | undefined;
    if (!options?.noTest) {
      testResult = await this.runTestsForFiles(files, projectDir);
    }

    // 计算置信度
    const confidence = this.confidenceScorer.computeScore(diffResults, hallucinations, testResult);

    const report = this.generateReport({
      id: this.generateReportId(),
      timestamp: Date.now(),
      options: { path: targetPath, ...options },
      files_checked: files,
      diffResults,
      hallucinations,
      testResult,
      confidence,
      summary: '',
    });

    if (this.storage) {
      this.storage.recordVerification(report);
    }

    return report;
  }

  /**
   * 生成验证报告（使用自适应输出预算）
   */
  generateReport(result: VerificationReport): VerificationReport {
    const projectDir = this.findProjectRoot();
    const fileCount = countProjectFiles(projectDir);
    const contextBuilder = new ContextBuilder(fileCount);
    const summary = contextBuilder.buildReport(result);

    return {
      ...result,
      summary,
    };
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 生成报告ID
   */
  private generateReportId(): string {
    return `cg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 查找项目根目录
   */
  private findProjectRoot(): string {
    let current = process.cwd();
    const markers = ['package.json', 'go.mod', 'pyproject.toml', 'setup.py', '.git'];

    while (current !== path.dirname(current)) {
      for (const marker of markers) {
        if (fs.existsSync(path.join(current, marker))) {
          return current;
        }
      }
      current = path.dirname(current);
    }

    return process.cwd();
  }

  /**
   * 检测文件语言
   */
  private detectLanguage(filePath: string): Language {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.py':
        return 'python';
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.go':
        return 'go';
      default:
        return 'unknown';
    }
  }

  /**
   * 获取两个提交之间的差异文件列表
   */
  private async getDiffFiles(base: string, head: string, projectDir: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--name-only', base, head], {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      return stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
    } catch (err) {
      logger.warn('获取diff文件列表失败', err);
      return [];
    }
  }

  /**
   * 获取指定提交中的文件内容
   */
  private async getFileAtCommit(
    filePath: string,
    commit: string,
    projectDir: string,
  ): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['show', `${commit}:${filePath}`], {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      return stdout;
    } catch (err) {
      logger.warn('获取提交中文件内容失败', err);
      return '';
    }
  }

  /**
   * 获取暂存区文件列表
   */
  private async getStagedFiles(projectDir: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-only'], {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      return stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
    } catch (err) {
      logger.warn('获取暂存区文件列表失败', err);
      return [];
    }
  }

  /**
   * 获取暂存区文件变更前内容
   */
  private async getStagedFileBefore(filePath: string, projectDir: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['show', `HEAD:${filePath}`], {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      return stdout;
    } catch (err) {
      // 新文件，没有之前的内容
      logger.warn('新文件，没有之前的内容', err);
      return null;
    }
  }

  /**
   * 获取暂存区文件变更后内容
   */
  private async getStagedFileAfter(filePath: string, projectDir: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['show', `:${filePath}`], {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      return stdout;
    } catch (err) {
      logger.warn('获取暂存区文件变更后内容失败', err);
      return null;
    }
  }

  /**
   * 为文件列表运行相关测试
   */
  private async runTestsForFiles(
    files: string[],
    projectDir: string,
  ): Promise<TestResult | undefined> {
    const allTestFiles: string[] = [];

    for (const filePath of files) {
      const relatedTests = this.testRunner.findRelatedTests(filePath, projectDir);
      allTestFiles.push(...relatedTests);
    }

    const uniqueTestFiles = [...new Set(allTestFiles)];
    if (uniqueTestFiles.length === 0) return undefined;

    const framework = this.testRunner.detectTestFramework(projectDir);
    return this.testRunner.runTests(uniqueTestFiles, projectDir, framework);
  }

  /**
   * 收集目录下的代码文件
   * 跳过超过 1MB 的文件以避免内存问题
   */
  private collectFiles(dir: string): string[] {
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB
    const codeExtensions = new Set(['.py', '.ts', '.tsx', '.js', '.jsx', '.go']);
    const ignoreDirs = new Set([
      'node_modules',
      '.git',
      '__pycache__',
      'dist',
      'build',
      '.venv',
      'venv',
      'vendor',
      '.next',
      '.nuxt',
    ]);
    const files: string[] = [];

    const walk = (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (ignoreDirs.has(entry.name)) continue;

          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (codeExtensions.has(ext)) {
              try {
                const stat = fs.statSync(fullPath);
                if (stat.size <= MAX_FILE_SIZE) {
                  files.push(fullPath);
                }
              } catch {
                // 跳过无法获取大小的文件
              }
            }
          }
        }
      } catch (err) {
        // 跳过无权限目录
        logger.warn('跳过无权限目录', err);
      }
    };

    walk(dir);
    return files;
  }
}
