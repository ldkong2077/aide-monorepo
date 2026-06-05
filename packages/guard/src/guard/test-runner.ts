/**
 * CodeGuard - 自动测试运行器
 * 检测测试框架、查找相关测试文件并执行测试
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TestFramework, TestResult, TestError } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * 自动测试运行器
 * 支持多种测试框架的自动检测和执行
 */
export class TestRunner {
  /**
   * 运行与指定文件相关的测试
   */
  async runAffectedTests(filePath: string, projectDir: string): Promise<TestResult> {
    const framework = this.detectTestFramework(projectDir);
    const testFiles = this.findRelatedTests(filePath, projectDir);

    if (testFiles.length === 0) {
      return {
        passed: 0,
        failed: 0,
        total: 0,
        errors: [],
        duration: 0,
      };
    }

    return this.runTests(testFiles, projectDir, framework);
  }

  /**
   * 检测项目使用的测试框架
   */
  detectTestFramework(projectDir: string): TestFramework {
    // 检查package.json中的依赖
    const packageJsonPath = path.join(projectDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (allDeps.vitest) return 'vitest';
        if (allDeps.jest) return 'jest';
      } catch {
        // 解析失败，继续检查其他方式
      }
    }

    // 检查配置文件
    if (
      fs.existsSync(path.join(projectDir, 'vitest.config.ts')) ||
      fs.existsSync(path.join(projectDir, 'vitest.config.js'))
    ) {
      return 'vitest';
    }

    if (
      fs.existsSync(path.join(projectDir, 'jest.config.ts')) ||
      fs.existsSync(path.join(projectDir, 'jest.config.js')) ||
      fs.existsSync(path.join(projectDir, 'jest.config.cjs'))
    ) {
      return 'jest';
    }

    // 检查Python项目
    if (
      fs.existsSync(path.join(projectDir, 'pytest.ini')) ||
      fs.existsSync(path.join(projectDir, 'pyproject.toml')) ||
      fs.existsSync(path.join(projectDir, 'setup.cfg'))
    ) {
      // 检查pyproject.toml是否包含pytest配置
      const pyprojectPath = path.join(projectDir, 'pyproject.toml');
      if (fs.existsSync(pyprojectPath)) {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        if (content.includes('pytest')) return 'pytest';
      }

      // 检查setup.cfg是否包含pytest配置
      const setupCfgPath = path.join(projectDir, 'setup.cfg');
      if (fs.existsSync(setupCfgPath)) {
        const content = fs.readFileSync(setupCfgPath, 'utf-8');
        if (content.includes('pytest')) return 'pytest';
      }
    }

    // 检查是否有conftest.py（pytest标志）
    if (this.hasFileInDir(projectDir, 'conftest.py')) {
      return 'pytest';
    }

    // 检查Go项目
    if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
      // 检查是否有_test.go文件
      if (this.hasFileInDir(projectDir, '_test.go')) {
        return 'go_test';
      }
    }

    return 'unknown';
  }

  /**
   * 查找与变更文件相关的测试文件
   */
  findRelatedTests(filePath: string, projectDir: string): string[] {
    const testFiles: string[] = [];
    const basename = path.basename(filePath, path.extname(filePath));
    const dir = path.dirname(filePath);

    // 常见的测试文件命名模式
    const testPatterns = [
      // 同目录下的测试文件
      path.join(dir, `${basename}.test.ts`),
      path.join(dir, `${basename}.test.js`),
      path.join(dir, `${basename}.spec.ts`),
      path.join(dir, `${basename}.spec.js`),
      path.join(dir, `test_${basename}.py`),
      path.join(dir, `${basename}_test.go`),
      // __tests__目录
      path.join(dir, '__tests__', `${basename}.test.ts`),
      path.join(dir, '__tests__', `${basename}.test.js`),
      // tests目录
      path.join(dir, 'tests', `test_${basename}.py`),
      // 上级目录的tests
      path.join(path.dirname(dir), 'tests', `test_${basename}.py`),
    ];

    for (const pattern of testPatterns) {
      if (fs.existsSync(pattern)) {
        testFiles.push(pattern);
      }
    }

    // 如果没找到精确匹配，搜索整个项目的测试目录
    if (testFiles.length === 0) {
      const searchDirs = ['__tests__', 'tests', 'test', 'spec'];
      for (const searchDir of searchDirs) {
        const searchPath = path.join(projectDir, searchDir);
        if (fs.existsSync(searchPath)) {
          const found = this.findTestFilesFor(searchPath, basename);
          testFiles.push(...found);
        }
      }
    }

    return [...new Set(testFiles)]; // 去重
  }

  /**
   * 执行测试并解析结果
   */
  async runTests(
    testFiles: string[],
    projectDir: string,
    framework?: TestFramework,
  ): Promise<TestResult> {
    const detectedFramework = framework || this.detectTestFramework(projectDir);
    const startTime = Date.now();

    try {
      switch (detectedFramework) {
        case 'jest':
          return this.runJestTests(testFiles, projectDir, startTime);
        case 'vitest':
          return this.runVitestTests(testFiles, projectDir, startTime);
        case 'pytest':
          return this.runPytestTests(testFiles, projectDir, startTime);
        case 'go_test':
          return this.runGoTests(testFiles, projectDir, startTime);
        default:
          return {
            passed: 0,
            failed: 0,
            total: 0,
            errors: [{ testName: 'framework_detection', message: '无法检测到测试框架' }],
            duration: Date.now() - startTime,
          };
      }
    } catch (error) {
      return {
        passed: 0,
        failed: 0,
        total: 0,
        errors: [
          {
            testName: 'execution_error',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 解析测试输出
   */
  parseTestOutput(
    output: string,
    framework: TestFramework,
  ): { passed: number; failed: number; total: number; errors: TestError[] } {
    switch (framework) {
      case 'jest':
        return this.parseJestOutput(output);
      case 'vitest':
        return this.parseVitestOutput(output);
      case 'pytest':
        return this.parsePytestOutput(output);
      case 'go_test':
        return this.parseGoTestOutput(output);
      default:
        return { passed: 0, failed: 0, total: 0, errors: [] };
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 运行Jest测试
   */
  private async runJestTests(
    testFiles: string[],
    projectDir: string,
    startTime: number,
  ): Promise<TestResult> {
    const { stdout } = await execFileAsync(
      'npx',
      ['jest', '--no-coverage', '--json', ...testFiles],
      {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: 60000,
      },
    );

    const duration = Date.now() - startTime;
    const parsed = this.parseJestOutput(stdout);

    return {
      ...parsed,
      duration,
    };
  }

  /**
   * 运行Vitest测试
   */
  private async runVitestTests(
    testFiles: string[],
    projectDir: string,
    startTime: number,
  ): Promise<TestResult> {
    const { stdout } = await execFileAsync(
      'npx',
      ['vitest', 'run', '--reporter=json', ...testFiles],
      {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: 60000,
      },
    );

    const duration = Date.now() - startTime;
    const parsed = this.parseVitestOutput(stdout);

    return {
      ...parsed,
      duration,
    };
  }

  /**
   * 运行pytest测试
   */
  private async runPytestTests(
    testFiles: string[],
    projectDir: string,
    startTime: number,
  ): Promise<TestResult> {
    const { stdout } = await execFileAsync('python', ['-m', 'pytest', '-v', ...testFiles], {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 60000,
    });

    const duration = Date.now() - startTime;
    const parsed = this.parsePytestOutput(stdout);

    return {
      ...parsed,
      duration,
    };
  }

  /**
   * 运行Go测试
   */
  private async runGoTests(
    testFiles: string[],
    projectDir: string,
    startTime: number,
  ): Promise<TestResult> {
    // Go测试按包运行，提取目录
    const dirs = [...new Set(testFiles.map((f) => path.dirname(f)))];

    const { stdout } = await execFileAsync('go', ['test', '-v', ...dirs], {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 60000,
    });

    const duration = Date.now() - startTime;
    const parsed = this.parseGoTestOutput(stdout);

    return {
      ...parsed,
      duration,
    };
  }

  /**
   * 解析Jest JSON输出
   */
  private parseJestOutput(output: string): {
    passed: number;
    failed: number;
    total: number;
    errors: TestError[];
  } {
    try {
      const result = JSON.parse(output);
      const errors: TestError[] = [];

      if (result.testResults) {
        for (const testResult of result.testResults) {
          if (testResult.failureMessage) {
            errors.push({
              testName: testResult.name,
              message: testResult.failureMessage,
            });
          }
        }
      }

      return {
        passed: result.numPassedTests || 0,
        failed: result.numFailedTests || 0,
        total: result.numTotalTests || 0,
        errors,
      };
    } catch {
      // JSON解析失败，尝试从文本中提取
      return this.parseTestOutputFromText(
        output,
        /Tests:\s+(\d+) passed.*?(\d+) failed.*?(\d+) total/,
      );
    }
  }

  /**
   * 解析Vitest JSON输出
   */
  private parseVitestOutput(output: string): {
    passed: number;
    failed: number;
    total: number;
    errors: TestError[];
  } {
    try {
      const result = JSON.parse(output);
      const errors: TestError[] = [];

      if (result.testResults) {
        for (const suite of result.testResults) {
          for (const test of suite.assertionResults || []) {
            if (test.status === 'failed') {
              errors.push({
                testName: test.fullName || test.title,
                message: test.failureMessages?.join('\n') || '测试失败',
              });
            }
          }
        }
      }

      return {
        passed: result.numPassedTests || 0,
        failed: result.numFailedTests || 0,
        total: result.numTotalTests || 0,
        errors,
      };
    } catch {
      return this.parseTestOutputFromText(
        output,
        /Tests\s+(\d+) passed.*?(\d+) failed.*?(\d+) total/,
      );
    }
  }

  /**
   * 解析pytest输出
   */
  private parsePytestOutput(output: string): {
    passed: number;
    failed: number;
    total: number;
    errors: TestError[];
  } {
    const errors: TestError[] = [];

    // 提取失败测试信息
    const failureRegex = /FAILED\s+(.+?)\s*-/g;
    let match;
    while ((match = failureRegex.exec(output)) !== null) {
      errors.push({
        testName: match[1].trim(),
        message: '测试失败',
      });
    }

    // 提取摘要行
    const summaryRegex = /(\d+) passed(?:,\s+(\d+) failed)?(?:,\s+(\d+) skipped)?/;
    const summaryMatch = summaryRegex.exec(output);

    if (summaryMatch) {
      const passed = parseInt(summaryMatch[1] || '0', 10);
      const failed = parseInt(summaryMatch[2] || '0', 10);
      return {
        passed,
        failed,
        total: passed + failed,
        errors,
      };
    }

    return this.parseTestOutputFromText(output, /(\d+) passed.*?(\d+) failed/);
  }

  /**
   * 解析Go测试输出
   */
  private parseGoTestOutput(output: string): {
    passed: number;
    failed: number;
    total: number;
    errors: TestError[];
  } {
    const errors: TestError[] = [];
    let passed = 0;
    let failed = 0;

    // 解析 go test -v 输出
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('--- PASS')) {
        passed++;
      } else if (line.startsWith('--- FAIL')) {
        failed++;
        const testName = line.replace('--- FAIL: ', '').trim();
        errors.push({ testName, message: '测试失败' });
      }
    }

    return {
      passed,
      failed,
      total: passed + failed,
      errors,
    };
  }

  /**
   * 从文本中提取测试结果（通用回退方法）
   */
  private parseTestOutputFromText(
    output: string,
    regex: RegExp,
  ): { passed: number; failed: number; total: number; errors: TestError[] } {
    const match = output.match(regex);
    if (match) {
      const passed = parseInt(match[1] || '0', 10);
      const failed = parseInt(match[2] || '0', 10);
      const total = parseInt(match[3] || String(passed + failed), 10);
      return { passed, failed, total, errors: [] };
    }

    return { passed: 0, failed: 0, total: 0, errors: [] };
  }

  /**
   * 检查目录中是否存在匹配后缀的文件
   */
  private hasFileInDir(dir: string, suffix: string): boolean {
    try {
      const entries = this.walkDir(dir, 3); // 限制搜索深度
      return entries.some((e) => e.endsWith(suffix));
    } catch {
      return false;
    }
  }

  /**
   * 遍历目录查找文件
   */
  private walkDir(dir: string, maxDepth: number): string[] {
    const results: string[] = [];
    if (maxDepth <= 0) return results;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // 跳过常见的忽略目录
        if (
          ['node_modules', '.git', '__pycache__', 'dist', 'build', '.venv', 'venv'].includes(
            entry.name,
          )
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          results.push(fullPath);
        } else if (entry.isDirectory()) {
          results.push(...this.walkDir(fullPath, maxDepth - 1));
        }
      }
    } catch {
      // 权限错误等，跳过
    }

    return results;
  }

  /**
   * 在指定目录中查找与模块名匹配的测试文件
   */
  private findTestFilesFor(searchDir: string, moduleName: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        const name = entry.name.toLowerCase();
        if (
          name.includes(moduleName.toLowerCase()) &&
          (name.includes('.test.') || name.includes('.spec.') || name.includes('_test.'))
        ) {
          results.push(path.join(searchDir, entry.name));
        }
      }
    } catch {
      // 目录不存在或无权限
    }
    return results;
  }
}
