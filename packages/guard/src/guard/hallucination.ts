/**
 * CodeGuard - 幻觉检测引擎
 * 检测AI生成代码中的幻觉问题，包括不存在的包导入、虚假API调用、AI模式等
 */

import * as fs from 'fs';
import * as path from 'path';
import type { HallucinationReport, Language, Severity } from '../types.js';
import type { Storage } from '../storage/index.js';

// ==================== Python标准库（常用模块，约200个） ====================
const PYTHON_STDLIB = new Set([
  // 核心运行时
  'os',
  'sys',
  're',
  'json',
  'csv',
  'math',
  'random',
  'datetime',
  'time',
  'collections',
  'itertools',
  'functools',
  'operator',
  'pathlib',
  'shutil',
  'subprocess',
  'threading',
  'multiprocessing',
  'logging',
  'argparse',
  'unittest',
  'typing',
  'dataclasses',
  'abc',
  'io',
  'hashlib',
  'hmac',
  'secrets',
  'base64',
  'struct',
  'pickle',
  'copy',
  'pprint',
  'textwrap',
  'string',
  'enum',
  'contextlib',
  'traceback',
  'warnings',
  'weakref',
  'types',
  'inspect',
  'dis',
  'gc',
  'site',
  'codecs',
  'unicodedata',
  'locale',
  'gettext',
  'calendar',
  'heapq',
  'bisect',
  'array',
  'queue',
  'socket',
  'http',
  'urllib',
  'xml',
  'html',
  'email',
  'ftplib',
  'smtplib',
  'telnetlib',
  'ssl',
  'select',
  'selectors',
  'asyncio',
  'concurrent',
  'xmlrpc',
  'ipaddress',
  'uuid',
  'platform',
  'ctypes',
  'signal',
  'mmap',
  'tempfile',
  'glob',
  'fnmatch',
  'linecache',
  'stat',
  'fileinput',
  'configparser',
  'toml',
  'zipfile',
  'tarfile',
  'gzip',
  'bz2',
  'lzma',
  'zlib',
  'sqlite3',
  'dbm',
  'token',
  'tokenize',
  'ast',
  'symtable',
  'compileall',
  'pdb',
  'profile',
  'timeit',
  'trace',
  'resource',
  // 网络
  'http.server',
  'http.client',
  'http.cookies',
  'http.cookiejar',
  'urllib.request',
  'urllib.parse',
  'urllib.error',
  'urllib.robotparser',
  'xml.etree.ElementTree',
  'xml.dom',
  'xml.sax',
  'xml.parsers',
  'html.parser',
  'html.entities',
  'socketserver',
  'webbrowser',
  'xmlrpc.client',
  'xmlrpc.server',
  'poplib',
  'imaplib',
  'nntplib',
  'smtplib',
  'asyncio',
  'asyncio.subprocess',
  'asyncio.streams',
  // 数据与格式
  'csv',
  'json',
  'toml',
  'configparser',
  'plistlib',
  'email.mime',
  'email.mime.text',
  'email.mime.base',
  'email.mime.multipart',
  'email.header',
  'email.utils',
  'email.message',
  'mailcap',
  'mailbox',
  'mimetypes',
  'netrc',
  'xdrlib',
  'curses',
  'curses.textpad',
  // 加密与安全
  'hashlib',
  'hmac',
  'secrets',
  'ssl',
  // 数据库
  'sqlite3',
  'dbm',
  'dbm.dumb',
  'dbm.gnu',
  'dbm.ndbm',
  // 文件与目录
  'tempfile',
  'glob',
  'fnmatch',
  'linecache',
  'stat',
  'fileinput',
  'shutil',
  'pathlib',
  'os.path',
  // 系统与进程
  'atexit',
  'signal',
  'resource',
  'syslog',
  'posix',
  'nt',
  'pwd',
  'spwd',
  'grp',
  'nis',
  // 调试与测试
  'unittest.mock',
  'unittest.runner',
  'unittest.suite',
  'unittest.case',
  'doctest',
  'pydoc',
  'compileall',
  'py_compile',
  'bdb',
  'pdb',
  'profile',
  'cProfile',
  'pstats',
  'timeit',
  'trace',
  'faulthandler',
  'tracemalloc',
  'warnings',
  // 国际化
  'gettext',
  'locale',
  'codecs',
  'encodings',
  // 数据类型与工具
  'collections.abc',
  'collections.defaultdict',
  'collections.OrderedDict',
  'collections.Counter',
  'collections.deque',
  'collections.namedtuple',
  'collections.ChainMap',
  'typing',
  'dataclasses',
  'enum',
  'numbers',
  'decimal',
  'fractions',
  'statistics',
  'cmath',
  'math',
  'array',
  'bisect',
  'heapq',
  'sched',
  'weakref',
  'weakref.WeakKeyDictionary',
  'weakref.WeakValueDictionary',
  'types',
  'types.MappingProxyType',
  'types.SimpleNamespace',
  'functools',
  'functools.lru_cache',
  'functools.partial',
  'functools.wraps',
  'itertools',
  'itertools.chain',
  'itertools.combinations',
  'operator',
  'operator.attrgetter',
  'operator.itemgetter',
  'copy',
  'copy.deepcopy',
  'pprint',
  'textwrap',
  'string',
  're',
  'difflib',
  // 并发
  'threading',
  'threading.Thread',
  'threading.Lock',
  'threading.Event',
  'threading.Condition',
  'threading.Semaphore',
  'threading.Barrier',
  'multiprocessing',
  'multiprocessing.Pool',
  'multiprocessing.Queue',
  'concurrent.futures',
  'concurrent.futures.ThreadPoolExecutor',
  'concurrent.futures.ProcessPoolExecutor',
  'queue',
  'queue.Queue',
  'queue.LifoQueue',
  'queue.PriorityQueue',
  'subprocess',
  'subprocess.run',
  'subprocess.Popen',
  'asyncio',
  'asyncio.run',
  'asyncio.gather',
  'asyncio.create_task',
  // 其他
  'venv',
  'zipapp',
  'importlib',
  'importlib.metadata',
  'importlib.resources',
  'pkgutil',
  'modulefinder',
  'runpy',
  'sysconfig',
  'site',
  'code',
  'codeop',
  'crypt',
  'curses',
  'curses.ascii',
  'turtle',
  'tkinter',
  'colorsys',
  'imghdr',
  'sndhdr',
  'wave',
  'chunk',
  'aifc',
  'sunau',
  'audioop',
  'msvcrt',
  'winreg',
  'winsound', // Windows
  'posixpath',
  'ntpath',
  'genericpath',
  'optparse',
  'getpass',
  'cmd',
  'shlex',
  'tty',
  'pty',
  'termios',
  'readline',
  'rlcompleter',
]);

// ==================== Node.js内置模块 ====================
const NODE_BUILTINS = new Set([
  'assert',
  'assert/strict',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'dns/promises',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'readline/promises',
  'repl',
  'stream',
  'stream/consumers',
  'stream/promises',
  'stream/web',
  'string_decoder',
  'sys',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'util/types',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
  // node: 前缀
  'node:assert',
  'node:assert/strict',
  'node:async_hooks',
  'node:buffer',
  'node:child_process',
  'node:cluster',
  'node:console',
  'node:crypto',
  'node:dgram',
  'node:diagnostics_channel',
  'node:dns',
  'node:dns/promises',
  'node:domain',
  'node:events',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:http2',
  'node:https',
  'node:inspector',
  'node:module',
  'node:net',
  'node:os',
  'node:path',
  'node:perf_hooks',
  'node:process',
  'node:punycode',
  'node:querystring',
  'node:readline',
  'node:readline/promises',
  'node:repl',
  'node:stream',
  'node:stream/consumers',
  'node:stream/promises',
  'node:stream/web',
  'node:string_decoder',
  'node:sys',
  'node:timers',
  'node:timers/promises',
  'node:tls',
  'node:trace_events',
  'node:tty',
  'node:url',
  'node:util',
  'node:util/types',
  'node:v8',
  'node:vm',
  'node:wasi',
  'node:worker_threads',
  'node:zlib',
  // 测试模块 (Node 18+)
  'node:test',
  'test',
]);

// ==================== Go标准库包 ====================
const GO_STDLIB = new Set([
  'archive',
  'archive/tar',
  'archive/zip',
  'bufio',
  'builtin',
  'bytes',
  'compress',
  'compress/bzip2',
  'compress/flate',
  'compress/gzip',
  'compress/lzw',
  'compress/zlib',
  'container',
  'container/heap',
  'container/list',
  'container/ring',
  'context',
  'crypto',
  'crypto/aes',
  'crypto/cipher',
  'crypto/des',
  'crypto/dsa',
  'crypto/ecdsa',
  'crypto/ed25519',
  'crypto/elliptic',
  'crypto/hmac',
  'crypto/md5',
  'crypto/rand',
  'crypto/rc4',
  'crypto/rsa',
  'crypto/sha1',
  'crypto/sha256',
  'crypto/sha512',
  'crypto/subtle',
  'crypto/tls',
  'crypto/x509',
  'database',
  'database/sql',
  'debug',
  'debug/dwarf',
  'debug/elf',
  'debug/gosym',
  'debug/macho',
  'debug/pe',
  'debug/plan9obj',
  'embed',
  'encoding',
  'encoding/ascii85',
  'encoding/asn1',
  'encoding/base32',
  'encoding/base64',
  'encoding/binary',
  'encoding/csv',
  'encoding/gob',
  'encoding/hex',
  'encoding/json',
  'encoding/pem',
  'encoding/xml',
  'errors',
  'expvar',
  'flag',
  'fmt',
  'go',
  'go/ast',
  'go/build',
  'go/constant',
  'go/doc',
  'go/format',
  'go/importer',
  'go/parser',
  'go/printer',
  'go/scanner',
  'go/token',
  'go/types',
  'hash',
  'hash/adler32',
  'hash/crc32',
  'hash/crc64',
  'hash/fnv',
  'html',
  'html/template',
  'image',
  'image/color',
  'image/color/palette',
  'image/draw',
  'image/gif',
  'image/jpeg',
  'image/png',
  'index',
  'index/suffixarray',
  'io',
  'io/fs',
  'io/ioutil',
  'log',
  'log/syslog',
  'maps',
  'math',
  'math/big',
  'math/bits',
  'math/cmplx',
  'math/rand',
  'mime',
  'mime/multipart',
  'mime/quotedprintable',
  'net',
  'net/http',
  'net/http/cgi',
  'net/http/cookiejar',
  'net/http/fcgi',
  'net/http/httptest',
  'net/http/httptrace',
  'net/http/httputil',
  'net/http/pprof',
  'net/mail',
  'net/netip',
  'net/rpc',
  'net/rpc/jsonrpc',
  'net/smtp',
  'net/textproto',
  'net/url',
  'os',
  'os/exec',
  'os/signal',
  'os/user',
  'path',
  'path/filepath',
  'plugin',
  'reflect',
  'regexp',
  'regexp/syntax',
  'runtime',
  'runtime/cgo',
  'runtime/debug',
  'runtime/metrics',
  'runtime/pprof',
  'runtime/race',
  'runtime/trace',
  'slices',
  'sort',
  'strconv',
  'strings',
  'sync',
  'sync/atomic',
  'syscall',
  'testing',
  'testing/fstest',
  'testing/iotest',
  'testing/quick',
  'text',
  'text/scanner',
  'text/tabwriter',
  'text/template',
  'text/template/parse',
  'time',
  'unicode',
  'unicode/utf16',
  'unicode/utf8',
  'unsafe',
]);

/**
 * 幻觉检测引擎
 * 检测AI生成代码中的各类幻觉问题
 * 支持从数据库加载自定义规则和可信包
 */
export class HallucinationDetector {
  private storage?: Storage;
  /** 缓存的自定义规则（从DB加载） */
  private customRules:
    | {
        category: string;
        pattern: string;
        language: string;
        severity: string;
        message: string;
        suggestion: string | null;
      }[]
    | null = null;
  /** 缓存的可信包列表（从DB加载） */
  private trustedPackagesCache = new Map<string, Set<string>>();

  constructor(storage?: Storage) {
    this.storage = storage;
  }

  /**
   * 加载自定义规则（延迟加载，首次调用时从DB读取）
   */
  private loadCustomRules(language?: string): {
    category: string;
    pattern: string;
    language: string;
    severity: string;
    message: string;
    suggestion: string | null;
  }[] {
    if (!this.storage) return [];
    if (this.customRules === null) {
      try {
        this.customRules = this.storage.getHallucinationRules(language);
      } catch {
        this.customRules = [];
      }
    }
    return this.customRules || [];
  }

  /**
   * 检查包是否在可信列表中（包括DB中的自定义可信包）
   */
  private isTrustedPackage(packageName: string, language: string): boolean {
    // 先检查内置标准库
    switch (language) {
      case 'python':
        if (PYTHON_STDLIB.has(packageName)) return true;
        break;
      case 'typescript':
      case 'javascript':
        if (NODE_BUILTINS.has(packageName)) return true;
        break;
      case 'go':
        if (GO_STDLIB.has(packageName)) return true;
        break;
    }

    // 检查DB中的可信包
    if (this.storage) {
      let trustedSet = this.trustedPackagesCache.get(language);
      if (trustedSet === undefined) {
        try {
          const packages = this.storage.getTrustedPackages(language);
          trustedSet = new Set(packages);
          this.trustedPackagesCache.set(language, trustedSet);
        } catch {
          trustedSet = new Set();
          this.trustedPackagesCache.set(language, trustedSet);
        }
      }
      if (trustedSet.has(packageName)) return true;
    }

    return false;
  }

  /**
   * 执行完整的幻觉检测
   */
  detect(code: string, language: Language, projectDir: string): HallucinationReport[] {
    const reports: HallucinationReport[] = [];

    // 包导入检查
    reports.push(...this.checkPackageImports(code, language, projectDir));

    // API签名检查
    reports.push(...this.checkAPISignatures(code, language, projectDir));

    // AI模式检测
    reports.push(...this.checkAIPatterns(code, language));

    // 逻辑问题检测
    reports.push(...this.checkLogicIssues(code, language));

    // 自定义规则检测（从DB加载的规则）
    reports.push(...this.checkCustomRules(code, language));

    return reports;
  }

  /**
   * 使用自定义规则检测（从DB加载的规则）
   */
  private checkCustomRules(code: string, language: Language): HallucinationReport[] {
    const rules = this.loadCustomRules(language);
    if (rules.length === 0) return [];

    const reports: HallucinationReport[] = [];

    for (const rule of rules) {
      if (rule.language !== 'any' && rule.language !== language) continue;

      if (rule.pattern.length > 500) continue;

      const hasRepeatingChars = /(.+)\1{4,}/.test(rule.pattern);
      if (hasRepeatingChars) continue;

      try {
        const regex = new RegExp(rule.pattern, 'g');
        let match;
        let matchCount = 0;
        while ((match = regex.exec(code)) !== null && matchCount < 100) {
          const line = this.getLineNumber(code, match.index);
          reports.push({
            category: rule.category as HallucinationReport['category'],
            severity: rule.severity as Severity,
            message: rule.message,
            line,
            snippet: match[0].trim(),
            suggestion: rule.suggestion || undefined,
          });
          matchCount++;
          if (match[0].length === 0) regex.lastIndex++;
        }
      } catch {
        // 正则表达式无效，跳过此规则
      }
    }

    return reports;
  }

  /**
   * 检查包导入是否存在
   * 根据不同语言检查标准库、第三方包和项目模块
   */
  checkPackageImports(code: string, language: Language, projectDir: string): HallucinationReport[] {
    const reports: HallucinationReport[] = [];

    switch (language) {
      case 'python':
        reports.push(...this.checkPythonImports(code, projectDir));
        break;
      case 'typescript':
      case 'javascript':
        reports.push(...this.checkJSImports(code, language, projectDir));
        break;
      case 'go':
        reports.push(...this.checkGoImports(code, projectDir));
        break;
    }

    return reports;
  }

  /**
   * 检查Python导入
   */
  private checkPythonImports(code: string, projectDir: string): HallucinationReport[] {
    const reports: HallucinationReport[] = [];
    // 匹配 import xxx 和 from xxx import yyy
    const importRegex = /^(?:from\s+(\S+)\s+import\s+|\s*import\s+)(\S+)/gm;
    let match;

    while ((match = importRegex.exec(code)) !== null) {
      const moduleName = (match[1] || match[2]).split('.')[0];
      const line = this.getLineNumber(code, match.index);

      // 跳过标准库和可信包
      if (this.isTrustedPackage(moduleName, 'python')) continue;

      // 跳过相对导入
      if (moduleName.startsWith('.')) continue;

      // 检查项目模块
      if (this.isProjectModulePython(moduleName, projectDir)) continue;

      // 检查site-packages
      if (this.isInstalledPythonPackage(moduleName, projectDir)) continue;

      // 可能是幻觉导入
      reports.push({
        category: 'package_import',
        severity: 'high',
        message: `可能不存在的Python包: "${moduleName}"`,
        line,
        snippet: match[0].trim(),
        suggestion: `请确认 "${moduleName}" 是否已安装，可运行: pip install ${moduleName}`,
      });
    }

    return reports;
  }

  /**
   * 检查JavaScript/TypeScript导入
   */
  private checkJSImports(
    code: string,
    language: Language,
    projectDir: string,
  ): HallucinationReport[] {
    const reports: HallucinationReport[] = [];
    // 匹配 import ... from 'xxx' 和 require('xxx')
    const importRegex = /(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = importRegex.exec(code)) !== null) {
      const modulePath = match[1];
      const line = this.getLineNumber(code, match.index);

      // 跳过Node.js内置模块和可信包
      if (this.isTrustedPackage(modulePath, language)) continue;

      // 跳过相对路径导入
      if (modulePath.startsWith('.') || modulePath.startsWith('/')) {
        // 检查相对路径是否存在
        if (!this.resolveJSRelativePath(modulePath, projectDir)) {
          reports.push({
            category: 'package_import',
            severity: 'high',
            message: `相对路径导入不存在: "${modulePath}"`,
            line,
            snippet: match[0].trim(),
            suggestion: `请确认文件路径 "${modulePath}" 是否正确`,
          });
        }
        continue;
      }

      // 提取包名（处理 @scope/package 格式）
      const packageName = this.extractNpmPackageName(modulePath);

      // 检查node_modules
      if (this.isInstalledNpmPackage(packageName, projectDir)) continue;

      reports.push({
        category: 'package_import',
        severity: 'high',
        message: `可能不存在的npm包: "${packageName}"`,
        line,
        snippet: match[0].trim(),
        suggestion: `请确认 "${packageName}" 是否已安装，可运行: npm install ${packageName}`,
      });
    }

    return reports;
  }

  /**
   * 检查Go导入
   */
  private checkGoImports(code: string, projectDir: string): HallucinationReport[] {
    const reports: HallucinationReport[] = [];
    // 匹配 import 块和单行 import
    const importBlockRegex = /import\s*\(([\s\S]*?)\)/g;
    const singleImportRegex = /import\s+"([^"]+)"/g;
    let match;

    const goModInfo = this.parseGoMod(projectDir);

    // 处理import块
    while ((match = importBlockRegex.exec(code)) !== null) {
      const blockContent = match[1];
      const pkgRegex = /"([^"]+)"/g;
      let pkgMatch;
      while ((pkgMatch = pkgRegex.exec(blockContent)) !== null) {
        this.checkSingleGoImport(
          pkgMatch[1],
          code,
          match.index + pkgMatch.index,
          projectDir,
          goModInfo,
          reports,
        );
      }
    }

    // 处理单行import
    while ((match = singleImportRegex.exec(code)) !== null) {
      this.checkSingleGoImport(match[1], code, match.index, projectDir, goModInfo, reports);
    }

    return reports;
  }

  /**
   * 检查单个Go导入
   */
  private checkSingleGoImport(
    importPath: string,
    code: string,
    index: number,
    projectDir: string,
    goModInfo: { moduleName: string; dependencies: Set<string> } | null,
    reports: HallucinationReport[],
  ): void {
    const line = this.getLineNumber(code, index);

    // 跳过标准库和可信包
    if (this.isTrustedPackage(importPath, 'go')) return;

    // 跳过项目内部包
    if (goModInfo && importPath.startsWith(goModInfo.moduleName)) return;

    // 跳过已知依赖
    if (goModInfo && goModInfo.dependencies.has(importPath)) return;

    // 检查vendor目录
    const vendorPath = path.join(projectDir, 'vendor', importPath);
    if (fs.existsSync(vendorPath)) return;

    reports.push({
      category: 'package_import',
      severity: 'high',
      message: `可能不存在的Go包: "${importPath}"`,
      line,
      snippet: `import "${importPath}"`,
      suggestion: `请确认 "${importPath}" 是否在 go.mod 中声明，可运行: go get ${importPath}`,
    });
  }

  /**
   * 检查API签名是否存在
   * 检测代码中调用的方法是否在对应类型上存在
   */
  checkAPISignatures(code: string, language: Language, _projectDir: string): HallucinationReport[] {
    const reports: HallucinationReport[] = [];

    // 检测常见的AI幻觉API调用模式
    const hallucinatedAPIs = this.getCommonHallucinatedAPIs(language);

    for (const api of hallucinatedAPIs) {
      const regex = new RegExp(api.pattern, 'g');
      let match;
      while ((match = regex.exec(code)) !== null) {
        const line = this.getLineNumber(code, match.index);
        reports.push({
          category: 'api_signature',
          severity: api.severity,
          message: api.message,
          line,
          snippet: match[0].trim(),
          suggestion: api.suggestion,
        });
      }
    }

    return reports;
  }

  /**
   * 获取各语言常见的AI幻觉API
   */
  private getCommonHallucinatedAPIs(language: Language): {
    pattern: string;
    message: string;
    severity: Severity;
    suggestion: string;
  }[] {
    const apis: {
      pattern: string;
      message: string;
      severity: Severity;
      suggestion: string;
    }[] = [];

    if (language === 'python') {
      apis.push(
        {
          pattern: 'pandas\\.read_csv\\(.*encoding\\s*=',
          message: 'pandas.read_csv 的 encoding 参数可能不存在于旧版本',
          severity: 'medium',
          suggestion: '请确认 pandas 版本是否支持该参数',
        },
        {
          pattern: 'requests\\.get\\(.*verify\\s*=',
          message: 'requests.get 的 verify 参数用法需确认',
          severity: 'low',
          suggestion: '请确认 requests 库版本是否支持该参数',
        },
      );
    }

    if (language === 'typescript' || language === 'javascript') {
      apis.push(
        {
          pattern: 'Array\\.fromAsync',
          message: 'Array.fromAsync 是较新的API，可能不被所有环境支持',
          severity: 'medium',
          suggestion: '请确认目标运行时是否支持 Array.fromAsync',
        },
        {
          pattern: 'fs\\.promises\\.readFile',
          message: 'fs.promises API 需要确认Node.js版本支持',
          severity: 'low',
          suggestion: '建议确认Node.js版本 >= 10',
        },
      );
    }

    if (language === 'go') {
      apis.push({
        pattern: 'os\\.ReadFile',
        message: 'os.ReadFile 需要 Go 1.16+',
        severity: 'medium',
        suggestion: '请确认Go版本 >= 1.16，或使用 ioutil.ReadFile',
      });
    }

    return apis;
  }

  /**
   * 检测AI生成代码的常见模式
   */
  checkAIPatterns(code: string, language: Language): HallucinationReport[] {
    const reports: HallucinationReport[] = [];
    const lines = code.split('\n');

    // 1. 检测伪造的API URL
    this.checkFabricatedURLs(code, reports);

    // 2. 检测通用配置键访问模式
    this.checkGenericConfigAccess(code, language, reports);

    // 3. 检测空catch块（AI常跳过错误处理）
    this.checkEmptyCatchBlocks(code, language, reports);

    // 4. 检测过于通用的变量名
    this.checkGenericVariableNames(code, language, reports);

    // 5. 检测重复代码的注释（AI模式）
    this.checkRestatingComments(lines, reports);

    return reports;
  }

  /**
   * 检测伪造的API URL
   */
  private checkFabricatedURLs(code: string, reports: HallucinationReport[]): void {
    // 匹配看起来像API URL但可能伪造的模式
    const urlRegex = /https?:\/\/api\.([a-z0-9-]+)\.(com|io|dev|org|net)\/(?:v\d+\/)?([a-z-]+)/gi;
    let match;

    while ((match = urlRegex.exec(code)) !== null) {
      const domain = match[1];
      // 常见的真实API域名
      const knownAPIs = new Set([
        'github',
        'openai',
        'anthropic',
        'google',
        'stripe',
        'cloudflare',
        'aws',
        'azure',
        'firebase',
        'vercel',
      ]);

      if (!knownAPIs.has(domain)) {
        const line = this.getLineNumber(code, match.index);
        reports.push({
          category: 'ai_pattern',
          severity: 'medium',
          message: `可能伪造的API URL: "${match[0]}"`,
          line,
          snippet: match[0],
          suggestion: '请确认此API端点是否真实存在，AI常生成不存在的API地址',
        });
      }
    }
  }

  /**
   * 检测通用配置键访问模式
   */
  private checkGenericConfigAccess(
    code: string,
    language: Language,
    reports: HallucinationReport[],
  ): void {
    const patterns: { regex: RegExp; message: string }[] = [];

    if (language === 'python') {
      patterns.push({
        regex: /config\.get\(\s*['"][\w.]+['"]\)/g,
        message: '通用配置键访问，请确认配置键是否真实存在',
      });
      patterns.push({
        regex: /os\.environ\.get\(\s*['"][A-Z_]+['"]\)/g,
        message: '环境变量访问，请确认变量名是否正确',
      });
    }

    if (language === 'typescript' || language === 'javascript') {
      patterns.push({
        regex: /process\.env\.[A-Z_]+/g,
        message: '环境变量访问，请确认变量名是否正确',
      });
      patterns.push({
        regex: /config\[['"][\w.]+['"]\]/g,
        message: '通用配置键访问，请确认配置键是否真实存在',
      });
    }

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(code)) !== null) {
        const line = this.getLineNumber(code, match.index);
        reports.push({
          category: 'ai_pattern',
          severity: 'low',
          message: pattern.message,
          line,
          snippet: match[0],
          suggestion: 'AI常生成看似合理但实际不存在的配置键，请验证',
        });
      }
    }
  }

  /**
   * 检测空catch块
   */
  private checkEmptyCatchBlocks(
    code: string,
    language: Language,
    reports: HallucinationReport[],
  ): void {
    let catchRegex: RegExp;

    if (language === 'python') {
      // except: pass 或 except Exception: pass
      catchRegex = /except\s*(?:\w+\s*)?:\s*\n(\s*pass\s*\n)/g;
    } else if (language === 'go') {
      // Go没有try-catch，跳过
      return;
    } else {
      // JavaScript/TypeScript: catch(e) {}
      catchRegex = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    }

    let match;
    while ((match = catchRegex.exec(code)) !== null) {
      const line = this.getLineNumber(code, match.index);
      reports.push({
        category: 'ai_pattern',
        severity: 'medium',
        message: '空的异常捕获块，AI常跳过错误处理',
        line,
        snippet: match[0].trim(),
        suggestion: '建议添加适当的错误处理逻辑，至少记录错误日志',
      });
    }
  }

  /**
   * 检测过于通用的变量名
   */
  private checkGenericVariableNames(
    code: string,
    language: Language,
    reports: HallucinationReport[],
  ): void {
    const genericNames = ['data', 'result', 'item', 'info', 'obj', 'temp', 'val', 'res', 'ret'];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配变量声明
      let declRegex: RegExp;
      if (language === 'python') {
        declRegex = /^(\s*)(\w+)\s*=/;
      } else if (language === 'go') {
        declRegex = /^(?:\s*)(?:(?:var|const)\s+|(\w+)\s*:=)/;
      } else {
        declRegex = /^(?:\s*)(?:(?:const|let|var)\s+)(\w+)/;
      }

      const declMatch = line.match(declRegex);
      if (declMatch) {
        const varName = declMatch[1] || declMatch[2];
        if (varName && genericNames.includes(varName.toLowerCase())) {
          // 检查变量是否在后续代码中被有意义地使用
          const remainingCode = lines.slice(i + 1).join('\n');
          const usageCount = (remainingCode.match(new RegExp(`\\b${varName}\\b`, 'g')) || [])
            .length;

          // 如果通用变量名只使用1-2次，可能缺乏上下文
          if (usageCount <= 2) {
            reports.push({
              category: 'ai_pattern',
              severity: 'low',
              message: `过于通用的变量名: "${varName}"，缺乏语义上下文`,
              line: i + 1,
              snippet: line.trim(),
              suggestion: `建议使用更具描述性的变量名替代 "${varName}"`,
            });
          }
        }
      }
    }
  }

  /**
   * 检测重复代码含义的注释（AI模式）
   */
  private checkRestatingComments(lines: string[], reports: HallucinationReport[]): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配行内注释
      const commentMatch = /^(.*?)\/\/\s*(.+)$/.exec(line);
      if (!commentMatch) continue;

      const codePart = commentMatch[1].trim();
      const commentPart = commentMatch[2].trim();

      // 如果注释只是重复代码的含义
      if (codePart.length > 5 && commentPart.length > 3) {
        const codeWords = codePart
          .replace(/[(){}[\];,.<>=+\-*/!@#$%^&|?:]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .map((w) => w.toLowerCase());

        const commentWords = commentPart
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .map((w) => w.toLowerCase());

        // 计算重叠词数
        const overlap = commentWords.filter((w) => codeWords.includes(w)).length;
        const similarity = overlap / Math.max(commentWords.length, 1);

        if (similarity > 0.6 && commentWords.length >= 2) {
          reports.push({
            category: 'ai_pattern',
            severity: 'info',
            message: '注释重复了代码含义，这是AI生成代码的常见模式',
            line: i + 1,
            snippet: line.trim(),
            suggestion: '建议删除重复代码含义的注释，或添加更有价值的说明',
          });
        }
      }
    }
  }

  /**
   * 检测逻辑不一致问题
   */
  checkLogicIssues(code: string, language: Language): HallucinationReport[] {
    const reports: HallucinationReport[] = [];

    // 1. 检测return/throw后的不可达代码
    this.checkUnreachableCode(code, language, reports);

    // 2. 检测永远为真/假的条件
    this.checkAlwaysTrueFalseConditions(code, language, reports);

    // 3. 检测未使用的变量/导入
    this.checkUnusedDeclarations(code, language, reports);

    return reports;
  }

  /**
   * 检测不可达代码
   */
  private checkUnreachableCode(
    code: string,
    language: Language,
    reports: HallucinationReport[],
  ): void {
    const lines = code.split('\n');
    let foundReturn = false;
    let returnLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // 检测return/throw语句
      if (/^(return|throw)\b/.test(trimmed)) {
        foundReturn = true;
        returnLine = i + 1;
        continue;
      }

      // 检测块结束（大括号或缩进减少）
      if (trimmed === '}' || trimmed === '') {
        foundReturn = false;
        continue;
      }

      // 如果return后有可执行代码
      if (
        foundReturn &&
        trimmed.length > 0 &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('#')
      ) {
        reports.push({
          category: 'logic_issue',
          severity: 'high',
          message: `不可达代码：第${returnLine}行的return/throw之后的代码永远不会执行`,
          line: i + 1,
          snippet: trimmed,
          suggestion: '请删除不可达的代码，或检查控制流是否正确',
        });
        foundReturn = false;
      }
    }
  }

  /**
   * 检测永远为真/假的条件
   */
  private checkAlwaysTrueFalseConditions(
    code: string,
    language: Language,
    reports: HallucinationReport[],
  ): void {
    // 检测简单的恒真/恒假条件
    const alwaysTruePatterns = [
      /\bif\s*\(\s*true\s*\)/,
      /\bif\s+True\b/, // Python
      /\bif\s*\(\s*1\s*\)/,
    ];

    const alwaysFalsePatterns = [
      /\bif\s*\(\s*false\s*\)/,
      /\bif\s+False\b/, // Python
      /\bif\s*\(\s*0\s*\)/,
    ];

    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of alwaysTruePatterns) {
        if (pattern.test(line)) {
          reports.push({
            category: 'logic_issue',
            severity: 'medium',
            message: '条件永远为真，此分支总是执行',
            line: i + 1,
            snippet: line.trim(),
            suggestion: '请检查条件逻辑是否正确，或简化代码结构',
          });
        }
      }

      for (const pattern of alwaysFalsePatterns) {
        if (pattern.test(line)) {
          reports.push({
            category: 'logic_issue',
            severity: 'medium',
            message: '条件永远为假，此分支永远不会执行',
            line: i + 1,
            snippet: line.trim(),
            suggestion: '请检查条件逻辑是否正确，或删除死代码',
          });
        }
      }
    }

    // 检测 x === x 类型的恒真比较
    const selfCompareRegex = /\b(\w+)\s*===?\s*\1\b/g;
    let match;
    while ((match = selfCompareRegex.exec(code)) !== null) {
      const line = this.getLineNumber(code, match.index);
      reports.push({
        category: 'logic_issue',
        severity: 'medium',
        message: `自比较总是为真: "${match[0]}"`,
        line,
        snippet: match[0],
        suggestion: '请检查是否应为不同的变量比较',
      });
    }
  }

  /**
   * 检测未使用的变量/导入
   */
  private checkUnusedDeclarations(
    code: string,
    language: Language,
    reports: HallucinationReport[],
  ): void {
    const lines = code.split('\n');
    const declarations = new Map<string, { line: number; type: 'variable' | 'import' }>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测导入
      if (language === 'python') {
        const importMatch = /^import\s+(\w+)/.exec(line);
        if (importMatch) {
          declarations.set(importMatch[1], { line: i + 1, type: 'import' });
        }
        const fromImportMatch = /^from\s+\S+\s+import\s+(.+)/.exec(line);
        if (fromImportMatch) {
          const names = fromImportMatch[1].split(',').map((n) => n.trim());
          for (const name of names) {
            declarations.set(name, { line: i + 1, type: 'import' });
          }
        }
      } else if (language === 'typescript' || language === 'javascript') {
        const importMatch = /import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))/.exec(line);
        if (importMatch) {
          const names = (importMatch[1] || importMatch[2] || importMatch[3] || '')
            .split(',')
            .map((n) =>
              n
                .trim()
                .replace(/\s+as\s+\w+/, '')
                .trim(),
            )
            .filter((n) => n.length > 0);
          for (const name of names) {
            declarations.set(name, { line: i + 1, type: 'import' });
          }
        }
      } else if (language === 'go') {
        const importMatch = /"([^"]+)"/.exec(line);
        if (importMatch && (line.includes('import') || lines[i - 1]?.trim() === 'import (')) {
          const pkgName = importMatch[1].split('/').pop() || '';
          if (pkgName) {
            declarations.set(pkgName, { line: i + 1, type: 'import' });
          }
        }
      }
    }

    // 检查每个声明是否被使用
    for (const [name, info] of declarations) {
      // 跳过下划线开头的变量（约定为有意不使用）
      if (name.startsWith('_')) continue;

      // 计算使用次数（排除声明行本身）
      const usageRegex = new RegExp(`\\b${name}\\b`, 'g');
      const matches = code.match(usageRegex);
      const usageCount = (matches || []).length;

      // 如果只出现1次（声明本身），则未使用
      if (usageCount <= 1) {
        reports.push({
          category: 'logic_issue',
          severity: 'low',
          message: `未使用的${info.type === 'import' ? '导入' : '变量'}: "${name}"`,
          line: info.line,
          suggestion:
            info.type === 'import'
              ? `请删除未使用的导入 "${name}"`
              : `请删除未使用的变量 "${name}"，或检查是否遗漏了使用`,
        });
      }
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取字符索引对应的行号
   */
  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }

  /**
   * 检查是否为Python项目模块
   */
  private isProjectModulePython(moduleName: string, projectDir: string): boolean {
    // 检查项目目录下是否有对应的.py文件或包目录
    const pyFile = path.join(projectDir, `${moduleName}.py`);
    const pkgDir = path.join(projectDir, moduleName);

    return (
      fs.existsSync(pyFile) ||
      (fs.existsSync(pkgDir) && fs.existsSync(path.join(pkgDir, '__init__.py')))
    );
  }

  /**
   * 检查Python包是否已安装
   */
  private isInstalledPythonPackage(moduleName: string, projectDir: string): boolean {
    // 简单检查：查找site-packages目录
    // 注意：这是简化实现，实际可能需要使用 pip show 或检查 sys.path
    const possiblePaths = [
      path.join(projectDir, 'venv', 'Lib', 'site-packages', moduleName),
      path.join(projectDir, '.venv', 'Lib', 'site-packages', moduleName),
      path.join(projectDir, 'venv', 'lib', 'python3', 'site-packages', moduleName),
    ];

    return possiblePaths.some((p) => fs.existsSync(p));
  }

  /**
   * 从npm模块路径提取包名
   */
  private extractNpmPackageName(modulePath: string): string {
    // @scope/package 格式
    if (modulePath.startsWith('@')) {
      const parts = modulePath.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : modulePath;
    }
    // 普通包名，取第一段
    return modulePath.split('/')[0];
  }

  /**
   * 检查npm包是否已安装
   */
  private isInstalledNpmPackage(packageName: string, projectDir: string): boolean {
    const pkgPath = path.join(projectDir, 'node_modules', packageName);
    return fs.existsSync(pkgPath);
  }

  /**
   * 解析JS相对路径是否存在
   */
  private resolveJSRelativePath(modulePath: string, projectDir: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
    const fullPath = path.resolve(projectDir, modulePath);

    // 检查精确路径
    if (fs.existsSync(fullPath)) return true;

    // 检查带扩展名的路径
    for (const ext of extensions) {
      if (fs.existsSync(fullPath + ext)) return true;
    }

    // 检查index文件
    for (const ext of extensions) {
      if (fs.existsSync(path.join(fullPath, `index${ext}`))) return true;
    }

    return false;
  }

  /**
   * 解析go.mod文件
   */
  private parseGoMod(projectDir: string): { moduleName: string; dependencies: Set<string> } | null {
    const goModPath = path.join(projectDir, 'go.mod');
    if (!fs.existsSync(goModPath)) return null;

    try {
      const content = fs.readFileSync(goModPath, 'utf-8');
      const lines = content.split('\n');

      let moduleName = '';
      const dependencies = new Set<string>();
      let inRequire = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // 提取模块名
        const moduleMatch = /^module\s+(\S+)/.exec(trimmed);
        if (moduleMatch) {
          moduleName = moduleMatch[1];
        }

        // require块开始
        if (trimmed === 'require (') {
          inRequire = true;
          continue;
        }

        // require块结束
        if (inRequire && trimmed === ')') {
          inRequire = false;
          continue;
        }

        // 收集依赖
        if (inRequire) {
          const depMatch = /^(\S+)\s+/.exec(trimmed);
          if (depMatch) {
            dependencies.add(depMatch[1]);
          }
        }

        // 单行require
        const singleReqMatch = /^require\s+(\S+)\s+/.exec(trimmed);
        if (singleReqMatch) {
          dependencies.add(singleReqMatch[1]);
        }
      }

      return { moduleName, dependencies };
    } catch {
      return null;
    }
  }
}
