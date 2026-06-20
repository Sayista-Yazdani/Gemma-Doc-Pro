export type TechStackItem = {
  lang: string;
  count: number;
  loc: number;
  framework: string;
  security: number;
};

export type DocData = {
  projectName: string;
  stats: {
    total: number;
    analyzed: number;
    totalLOC: number;
  };
  techStack: TechStackItem[];
  summary: string;
  guide: unknown[];
  health: {
    score: number;
    grade: string;
  };
  dependencyGraph: string;
  api: {
    endpoints: Array<{
      method: string;
      path: string;
      sourceFile: string;
      framework?: string;
    }>;
  };
  risk: {
    findings: Array<{
      id: string;
      severity: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      count: number;
      files: string[];
    }>;
  };
  security: {
    findings: Array<{
      id: string;
      severity: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      count: number;
      files: string[];
    }>;
  };
  optimizations: Array<{
    id: string;
    title: string;
    priority: 'high' | 'medium' | 'low';
    rationale: string;
    relatedLangs: string[];
    example?: { original: string; optimized: string };
  }>;
};

type AnalyzerOptions = {
  maxFiles?: number;
  maxFileBytes?: number;
  onProgress?: (processed: number, total: number, currentPath?: string) => void;
};

const DEFAULT_IGNORE_DIR_PARTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.cache',
  'coverage',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  'target',
  '.terraform',
  '.pytest_cache',
  '.mypy_cache',
]);

const EXT_TO_LANG: Record<string, string> = {
  js: 'JS',
  jsx: 'JS',
  mjs: 'JS',
  cjs: 'JS',
  ts: 'TS',
  tsx: 'TS',
  mts: 'TS',
  cts: 'TS',
  php: 'PHP',
  py: 'Python',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  cs: 'C#',
  c: 'C',
  cc: 'C++',
  cpp: 'C++',
  cxx: 'C++',
  h: 'C/C++',
  hpp: 'C/C++',
  swift: 'Swift',
  json: 'JSON',
  md: 'Markdown',
  css: 'CSS',
  scss: 'CSS',
  html: 'HTML',
  htm: 'HTML',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  sql: 'SQL',
};

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const SECURITY_RULES: Array<{
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  langs: string[];
  pattern: RegExp;
}> = [
  {
    id: 'js_eval',
    severity: 'high',
    title: 'Dynamic code execution (eval)',
    description: 'Use of eval() can enable code injection and makes code harder to audit.',
    langs: ['JS', 'TS'],
    pattern: /\beval\s*\(/g,
  },
  {
    id: 'js_new_function',
    severity: 'high',
    title: 'Dynamic code execution (new Function)',
    description: 'new Function() evaluates code at runtime and can enable injection.',
    langs: ['JS', 'TS'],
    pattern: /\bnew\s+Function\s*\(/g,
  },
  {
    id: 'js_innerhtml',
    severity: 'medium',
    title: 'Unsafe HTML injection (innerHTML)',
    description: 'Assigning to innerHTML can introduce XSS if the content is not sanitized.',
    langs: ['JS', 'TS'],
    pattern: /\.innerHTML\s*=/g,
  },
  {
    id: 'react_dangerous_html',
    severity: 'medium',
    title: 'Unsafe HTML injection (dangerouslySetInnerHTML)',
    description: 'dangerouslySetInnerHTML can introduce XSS if content is not sanitized.',
    langs: ['JS', 'TS'],
    pattern: /\bdangerouslySetInnerHTML\b/g,
  },
  {
    id: 'php_mysql_query',
    severity: 'high',
    title: 'Deprecated MySQL API (mysql_query)',
    description: 'mysql_* APIs are deprecated/removed; prefer PDO/MySQLi with parameterized queries.',
    langs: ['PHP'],
    pattern: /\bmysql_query\s*\(/g,
  },
  {
    id: 'php_eval',
    severity: 'high',
    title: 'Dynamic code execution (eval in PHP)',
    description: 'PHP eval() executes arbitrary code and is high risk.',
    langs: ['PHP'],
    pattern: /\beval\s*\(/g,
  },
  {
    id: 'py_eval',
    severity: 'high',
    title: 'Dynamic code execution (eval in Python)',
    description: 'Python eval() executes arbitrary code and is high risk.',
    langs: ['Python'],
    pattern: /\beval\s*\(/g,
  },
  {
    id: 'py_exec',
    severity: 'high',
    title: 'Dynamic code execution (exec in Python)',
    description: 'Python exec() executes arbitrary code and is high risk.',
    langs: ['Python'],
    pattern: /\bexec\s*\(/g,
  },
  {
    id: 'secret_private_key',
    severity: 'high',
    title: 'Private key material committed',
    description: 'Private keys should never be committed to source control; move to a secret manager and rotate immediately.',
    langs: ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'C', 'C++', 'HTML', 'CSS', 'YAML', 'TOML', 'JSON', 'SQL', 'Markdown'],
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: 'secret_github_pat',
    severity: 'high',
    title: 'Hardcoded GitHub token',
    description: 'GitHub Personal Access Tokens should not be committed; use environment variables or a secret manager.',
    langs: ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'C', 'C++', 'HTML', 'CSS', 'YAML', 'TOML', 'JSON', 'SQL', 'Markdown'],
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,520}\b/g,
  },
  {
    id: 'secret_aws_access_key_id',
    severity: 'high',
    title: 'Hardcoded AWS access key id',
    description: 'AWS access keys must not be committed; rotate keys and use IAM roles or secret managers.',
    langs: ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'C', 'C++', 'HTML', 'CSS', 'YAML', 'TOML', 'JSON', 'SQL', 'Markdown'],
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'secret_generic_assignment',
    severity: 'medium',
    title: 'Potential hardcoded secret',
    description: 'Potential credentials detected in source; validate and move secrets to env/secret manager.',
    langs: ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'HTML', 'YAML', 'TOML', 'JSON', 'SQL'],
    pattern: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*(['"`])([^'"`]{8,})\1/gi,
  },
];

const SECURITY_PENALTY: Record<'high' | 'medium' | 'low', number> = {
  high: 10,
  medium: 5,
  low: 2,
};

const RISK_RULES: Array<{
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  langs: string[];
  pattern: RegExp;
}> = [
  {
    id: 'todo_fixme',
    severity: 'low',
    title: 'Outstanding TODO/FIXME markers',
    description: 'TODO/FIXME markers indicate unfinished work that can become production risk if forgotten.',
    langs: ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'HTML', 'CSS', 'YAML', 'TOML', 'Markdown'],
    pattern: /\b(TODO|FIXME)\b/g,
  },
  {
    id: 'js_console',
    severity: 'low',
    title: 'Debug logging in source',
    description: 'console.* calls can leak sensitive info and increase noise; prefer structured logging with levels and redaction.',
    langs: ['JS', 'TS'],
    pattern: /\bconsole\.(?:log|debug|info|warn|error)\s*\(/g,
  },
  {
    id: 'js_debugger',
    severity: 'medium',
    title: 'Debugger statements present',
    description: 'debugger statements can halt execution in devtools and should be removed from production builds.',
    langs: ['JS', 'TS'],
    pattern: /\bdebugger\b/g,
  },
  {
    id: 'ts_any',
    severity: 'medium',
    title: 'TypeScript any usage',
    description: 'Overuse of any weakens type safety and can hide runtime bugs; prefer unknown + narrowing or proper types.',
    langs: ['TS'],
    pattern: /\b(?:as\s+any|:\s*any\b|<any>|\bany\[\])/g,
  },
  {
    id: 'php_debug',
    severity: 'low',
    title: 'PHP debug output in code',
    description: 'var_dump/print_r debugging can expose data; remove or guard by environment.',
    langs: ['PHP'],
    pattern: /\b(?:var_dump|print_r)\s*\(/g,
  },
  {
    id: 'py_print',
    severity: 'low',
    title: 'Python print() debugging',
    description: 'print() debugging in production paths can leak info and add noise; prefer logging with levels.',
    langs: ['Python'],
    pattern: /\bprint\s*\(/g,
  },
];

const isProbablyTextFile = (file: File) => {
  if (file.type) return file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('xml');
  return true;
};

const normalizePath = (p: string) => p.replace(/\\/g, '/');

const getExt = (path: string) => {
  const base = path.split('/').pop() || path;
  const i = base.lastIndexOf('.');
  if (i <= 0) return '';
  return base.slice(i + 1).toLowerCase();
};

const shouldIgnorePath = (relativePath: string) => {
  const parts = normalizePath(relativePath).split('/').filter(Boolean);
  return parts.some((p) => DEFAULT_IGNORE_DIR_PARTS.has(p));
};

const deriveProjectName = (files: File[]) => {
  const first = files[0];
  const rel = normalizePath(first?.webkitRelativePath || '');
  const root = rel.split('/')[0];
  return root || first?.name || 'Project';
};


const safeJsonParse = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const detectFrameworks = async (files: File[], projectName: string) => {
  const targets = new Set(['package.json', 'composer.json', 'requirements.txt', 'pyproject.toml', 'artisan']);
  const picked: Record<string, File> = {};
  const best: Record<string, File> = {};

  for (const f of files) {
    const rel = normalizePath(f.webkitRelativePath || '');
    const filename = rel.split('/').pop();
    if (!filename || !targets.has(filename)) continue;

    const parts = rel.split('/').filter(Boolean);
    if (parts[0] !== projectName) continue;

    if (parts.length === 2) {
      picked[filename] = f;
    } else if (!best[filename]) {
      best[filename] = f;
    }
  }

  const pkgFile = picked['package.json'] || best['package.json'];
  const composerFile = picked['composer.json'] || best['composer.json'];
  const requirementsFile = picked['requirements.txt'] || best['requirements.txt'];
  const pyprojectFile = picked['pyproject.toml'] || best['pyproject.toml'];
  const artisanFile = picked['artisan'] || best['artisan'];

  const frameworks = {
    js: 'Vanilla',
    php: 'Vanilla',
    python: 'Vanilla',
  };

  if (pkgFile) {
    const pkg = safeJsonParse<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(await pkgFile.text());
    const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) } as Record<string, string>;
    const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

    const detected: string[] = [];
    if (has('next')) detected.push('Next.js');
    if (has('nuxt') || has('nuxt3')) detected.push('Nuxt');
    if (has('@angular/core')) detected.push('Angular');
    if (has('vue')) detected.push('Vue');
    if (has('svelte')) detected.push('Svelte');
    if (has('react')) detected.push('React');
    if (has('vite')) detected.push('Vite');
    if (has('express')) detected.push('Express');
    if (has('fastify')) detected.push('Fastify');
    if (has('@nestjs/core')) detected.push('NestJS');
    if (has('koa')) detected.push('Koa');

    if (detected.length > 0) frameworks.js = Array.from(new Set(detected)).slice(0, 3).join(' + ');
  }

  if (composerFile) {
    const composer = safeJsonParse<{ require?: Record<string, string>; 'require-dev'?: Record<string, string> }>(await composerFile.text());
    const req = { ...(composer?.require || {}), ...(composer?.['require-dev'] || {}) } as Record<string, string>;
    const has = (name: string) => Object.prototype.hasOwnProperty.call(req, name);
    if (has('laravel/framework') || artisanFile) frameworks.php = 'Laravel';
    else if (has('symfony/symfony') || has('symfony/framework-bundle')) frameworks.php = 'Symfony';
    else if (has('wordpress/wordpress') || has('johnpbloch/wordpress')) frameworks.php = 'WordPress';
  } else if (artisanFile) {
    frameworks.php = 'Laravel';
  }

  if (requirementsFile) {
    const txt = (await requirementsFile.text()).toLowerCase();
    if (txt.includes('django')) frameworks.python = 'Django';
    else if (txt.includes('flask')) frameworks.python = 'Flask';
    else if (txt.includes('fastapi')) frameworks.python = 'FastAPI';
  } else if (pyprojectFile) {
    const txt = (await pyprojectFile.text()).toLowerCase();
    if (txt.includes('django')) frameworks.python = 'Django';
    else if (txt.includes('flask')) frameworks.python = 'Flask';
    else if (txt.includes('fastapi')) frameworks.python = 'FastAPI';
  }

  return frameworks;
};

const countLines = (text: string) => {
  let totalLines = 0;
  let nonEmptyLines = 0;
  let lineHasContent = false;

  if (text.length === 0) {
    return { totalLines: 0, nonEmptyLines: 0 };
  }

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10) {
      totalLines++;
      if (lineHasContent) nonEmptyLines++;
      lineHasContent = false;
      continue;
    }
    if (code === 13) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next !== 10) {
        totalLines++;
        if (lineHasContent) nonEmptyLines++;
        lineHasContent = false;
      }
      continue;
    }

    // Fast path for common whitespace
    if (code === 32 || code === 9) continue;
    lineHasContent = true;
  }

  totalLines++;
  if (lineHasContent) nonEmptyLines++;
  return { totalLines, nonEmptyLines };
};

const matchAll = (re: RegExp, text: string) => {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n++;
  return n;
};

const snippetFromIndex = (text: string, index: number, maxLen = 220) => {
  const lineStart = Math.max(0, (text.lastIndexOf('\n', index) + 1) || 0);
  const nextNewline = text.indexOf('\n', index);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  let line = text.slice(lineStart, lineEnd).trim();
  if (line.length > maxLen) line = line.slice(0, maxLen).trimEnd() + '…';
  return line;
};

const maskSecretLine = (ruleId: string, line: string) => {
  if (ruleId === 'secret_github_pat') {
    return line.replace(/\b(gh[pousr]_)[A-Za-z0-9_]{8,520}\b/g, (_m, p1) => `${p1}<REDACTED>`);
  }
  if (ruleId === 'secret_aws_access_key_id') {
    return line.replace(/\b((?:AKIA|ASIA))[0-9A-Z]{16}\b/g, (_m, p1) => `${p1}<REDACTED>`);
  }
  if (ruleId === 'secret_generic_assignment') {
    return line.replace(
      /\b(api[_-]?key|secret|token|password)\b\s*([:=])\s*(['"`])([^'"`]{8,})\3/gi,
      (_m, key, sep, quote) => `${key}${sep} ${quote}<REDACTED>${quote}`,
    );
  }
  if (ruleId === 'secret_private_key') {
    return '-----BEGIN PRIVATE KEY----- <REDACTED> -----END PRIVATE KEY-----';
  }
  return line;
};

const firstMatchLine = (text: string, re: RegExp) => {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m || typeof m.index !== 'number') return null;
  return snippetFromIndex(text, m.index);
};

const exampleForRule = (ruleId: string, text: string, re: RegExp) => {
  const line = firstMatchLine(text, re);
  if (!line) return null;
  if (ruleId.startsWith('secret_')) return maskSecretLine(ruleId, line);
  return line;
};

const resolveRelativeImport = (fromPath: string, specifier: string) => {
  const fromParts = normalizePath(fromPath).split('/').filter(Boolean);
  fromParts.pop(); // file name
  const specParts = specifier.split('/').filter(Boolean);

  const out: string[] = [...fromParts];
  for (const part of specParts) {
    if (part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
};

const resolveToKnownFile = (base: string, known: Set<string>) => {
  if (known.has(base)) return base;

  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.php`,
    `${base}.inc`,
    `${base}.html`,
    `${base}.htm`,
    `${base}.css`,
    `${base}.scss`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.php`,
    `${base}/index.html`,
  ];

  for (const c of candidates) {
    if (known.has(c)) return c;
  }
  return null;
};

const stripQueryHash = (value: string) => value.split('#')[0].split('?')[0].trim();

const isLocalReference = (value: string) => {
  const ref = value.trim();
  if (!ref || ref.startsWith('#')) return false;
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref);
};

const normalizeRoutePath = (path: string) => {
  const clean = stripQueryHash(path).replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!clean) return '/';
  return clean.startsWith('/') ? clean.replace(/\/+/g, '/') : `/${clean}`.replace(/\/+/g, '/');
};

const routeFromFilePath = (relativePath: string) => {
  const clean = normalizePath(relativePath);
  if (/^index\.(?:php|html?)$/i.test(clean)) return '/';
  if (/\/index\.(?:php|html?)$/i.test(clean)) {
    return `/${clean.replace(/\/index\.(?:php|html?)$/i, '')}`.replace(/\/+/g, '/');
  }
  return `/${clean}`.replace(/\/+/g, '/');
};

const dependencyGroup = (relativePath: string) => {
  const parts = normalizePath(relativePath).split('/').filter(Boolean);
  if (parts.length <= 1) return 'Root Pages';
  return parts[0];
};

const resolveReferencedPath = (fromPath: string, specifier: string, known: Set<string>) => {
  const cleaned = stripQueryHash(specifier).replace(/\\/g, '/');
  if (!isLocalReference(cleaned)) return null;

  const withoutLeadingSlash = cleaned.replace(/^\/+/, '');
  const base = cleaned.startsWith('/') ? withoutLeadingSlash : resolveRelativeImport(fromPath, cleaned);
  return resolveToKnownFile(base, known);
};

const addDependencyEdge = (edges: Set<string>, fromPath: string, targetPath: string) => {
  const fromGroup = dependencyGroup(fromPath);
  const toGroup = dependencyGroup(targetPath);
  if (fromGroup === toGroup) return;
  edges.add(`${fromGroup}-->${toGroup}`);
};

const isPublicPageLike = (relativePath: string) => {
  const parts = normalizePath(relativePath).split('/').filter(Boolean);
  const filename = parts[parts.length - 1] || '';
  if (!/\.(?:php|html?)$/i.test(filename)) return false;
  if (/^(?:_|\.|header|footer|sidebar|nav|navbar|config|connection|db|database|functions?)\./i.test(filename)) return false;

  const hiddenParts = new Set(['includes', 'include', 'inc', 'partials', 'templates', 'components', 'lib', 'libs', 'vendor', 'config', 'classes', 'models', 'migrations', 'tests']);
  return !parts.slice(0, -1).some((part) => hiddenParts.has(part.toLowerCase()));
};

const inferPhpPageMethods = (text: string) => {
  const methods = new Set<string>();
  if (/\$_(?:POST|FILES)\b/i.test(text) || /REQUEST_METHOD[^\n]{0,80}POST/i.test(text)) methods.add('POST');
  if (/\$_(?:GET|REQUEST)\b/i.test(text) || /REQUEST_METHOD[^\n]{0,80}GET/i.test(text)) methods.add('GET');
  if (methods.size === 0) methods.add('GET');
  return Array.from(methods);
};

const addEndpoint = (
  endpoints: Array<{ method: string; path: string; sourceFile: string; framework?: string }>,
  method: string,
  path: string,
  sourceFile: string,
  framework?: string,
) => {
  endpoints.push({
    method: method.toUpperCase(),
    path: normalizeRoutePath(path),
    sourceFile,
    framework,
  });
};

const makeDependencyMermaid = (edges: Array<[string, string]>) => {
  if (edges.length === 0) {
    return `graph TB\n  A["No dependency edges detected"]`;
  }

  const nodes = new Map<string, string>();
  const nodeId = (label: string) => {
    if (!nodes.has(label)) nodes.set(label, `N${nodes.size + 1}`);
    return nodes.get(label)!;
  };

  const cleanLabel = (label: string) => {
    return label
      .replace(/"/g, "'")
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim();
  };

  const lines: string[] = ['graph TB'];
  for (const [from, to] of edges) {
    const fromId = nodeId(from);
    const toId = nodeId(to);
    lines.push(`  ${fromId}["${cleanLabel(from)}"] --> ${toId}["${cleanLabel(to)}"]`);
  }
  return lines.join('\n');
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const gradeFromScore = (score: number) => {
  if (score >= 93) return 'A+';
  if (score >= 88) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'D';
};

export const analyzeUploadedProject = async (files: File[], options: AnalyzerOptions = {}): Promise<DocData> => {
  const projectName = deriveProjectName(files);
  const frameworks = await detectFrameworks(files, projectName);

  const maxFiles = options.maxFiles ?? 5000;
  const maxFileBytes = options.maxFileBytes ?? 2_000_000; // 2MB

  const langStats = new Map<string, { count: number; loc: number; securityPenalty: number }>();
  const dependencyEdges = new Set<string>();
  const securityHitsByRule = new Map<
    string,
    {
      id: string;
      severity: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      count: number;
      files: Set<string>;
      example?: string;
    }
  >();
  const riskHitsByRule = new Map<
    string,
    {
      id: string;
      severity: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      count: number;
      files: Set<string>;
      example?: string;
    }
  >();
  const apiEndpoints: Array<{ method: string; path: string; sourceFile: string; framework?: string }> = [];

  const relevant = files
    .filter((f) => {
      const rel = normalizePath(f.webkitRelativePath || f.name);
      if (shouldIgnorePath(rel)) return false;
      const ext = getExt(rel);
      if (!ext) return false;
      return Object.prototype.hasOwnProperty.call(EXT_TO_LANG, ext);
    })
    .slice(0, maxFiles);

  const knownRelativePaths = new Set<string>();
  const architectureGroups = new Map<string, number>();
  for (const f of relevant) {
    const rel = normalizePath(f.webkitRelativePath || f.name);
    const withoutRoot = rel.startsWith(`${projectName}/`) ? rel.slice(projectName.length + 1) : rel;
    knownRelativePaths.add(withoutRoot);

    const group = dependencyGroup(withoutRoot);
    architectureGroups.set(group, (architectureGroups.get(group) || 0) + 1);
  }

  let processed = 0;

  const analyzeOne = async (file: File) => {
    const rel = normalizePath(file.webkitRelativePath || file.name);
    const withoutRoot = rel.startsWith(`${projectName}/`) ? rel.slice(projectName.length + 1) : rel;
    const ext = getExt(withoutRoot);
    const lang = EXT_TO_LANG[ext] || ext.toUpperCase();

    if (!isProbablyTextFile(file)) return;
    if (file.size > maxFileBytes) return;

    const text = await file.text();
    const { nonEmptyLines } = countLines(text);

    const current = langStats.get(lang) || { count: 0, loc: 0, securityPenalty: 0 };
    current.count += 1;
    current.loc += nonEmptyLines;

    for (const rule of SECURITY_RULES) {
      if (!rule.langs.includes(lang)) continue;
      const hits = matchAll(rule.pattern, text);
      if (hits === 0) continue;
      current.securityPenalty += hits * SECURITY_PENALTY[rule.severity];

      const existing =
        securityHitsByRule.get(rule.id) ||
        {
          id: rule.id,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          count: 0,
          files: new Set<string>(),
        };
      existing.count += hits;
      existing.files.add(withoutRoot);
      if (!existing.example) {
        const ex = exampleForRule(rule.id, text, rule.pattern);
        if (ex) existing.example = ex;
      }
      securityHitsByRule.set(rule.id, existing);
    }

    for (const rule of RISK_RULES) {
      if (!rule.langs.includes(lang)) continue;
      const hits = matchAll(rule.pattern, text);
      if (hits === 0) continue;

      const existing =
        riskHitsByRule.get(rule.id) ||
        {
          id: rule.id,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          count: 0,
          files: new Set<string>(),
        };
      existing.count += hits;
      existing.files.add(withoutRoot);
      if (!existing.example) {
        const ex = exampleForRule(rule.id, text, rule.pattern);
        if (ex) existing.example = ex;
      }
      riskHitsByRule.set(rule.id, existing);
    }

    langStats.set(lang, current);

    const scanLinkedAssetsAndForms = () => {
      const attrRe = /\b(src|href|action)\s*=\s*(['"])([^'"]+)\2/gi;
      let attr: RegExpExecArray | null;
      while ((attr = attrRe.exec(text))) {
        const attrName = attr[1].toLowerCase();
        const ref = attr[3];
        const target = resolveReferencedPath(withoutRoot, ref, knownRelativePaths);
        if (target) addDependencyEdge(dependencyEdges, withoutRoot, target);

        if (attrName === 'action' && isLocalReference(ref)) {
          const formStart = Math.max(0, text.lastIndexOf('<form', attr.index));
          const formChunk = text.slice(formStart, attr.index + attr[0].length + 300);
          const methodMatch = formChunk.match(/\bmethod\s*=\s*(['"])(get|post|put|delete|patch)\1/i);
          addEndpoint(apiEndpoints, methodMatch?.[2] || 'GET', ref || routeFromFilePath(withoutRoot), withoutRoot, 'HTML Form');
        }
      }
    };

    if (lang === 'HTML' || lang === 'PHP') {
      scanLinkedAssetsAndForms();
    }

    if (lang === 'CSS') {
      const cssRefRe = /(?:@import\s+(?:url\()?|url\()\s*(['"]?)([^'")]+)\1/gi;
      let cssRef: RegExpExecArray | null;
      while ((cssRef = cssRefRe.exec(text))) {
        const target = resolveReferencedPath(withoutRoot, cssRef[2], knownRelativePaths);
        if (target) addDependencyEdge(dependencyEdges, withoutRoot, target);
      }
    }

    // Dependency extraction for JS/TS
    if (lang === 'JS' || lang === 'TS') {
      const addImports = (re: RegExp) => {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          const spec = m[1];
          if (!spec.startsWith('.')) continue;
          const base = resolveRelativeImport(withoutRoot, spec);
          const target = resolveToKnownFile(base, knownRelativePaths);
          if (!target) continue;
          addDependencyEdge(dependencyEdges, withoutRoot, target);
        }
      };

      addImports(IMPORT_RE);
      addImports(REQUIRE_RE);
      addImports(DYNAMIC_IMPORT_RE);

      const jsUrlRe = /\b(?:fetch|importScripts)\s*\(\s*(['"`])([^'"`]+)\1|\baxios\.(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\4|\$\.(get|post)\s*\(\s*(['"`])([^'"`]+)\7/gi;
      let jsUrl: RegExpExecArray | null;
      while ((jsUrl = jsUrlRe.exec(text))) {
        const method = (jsUrl[3] || jsUrl[6] || 'GET').toUpperCase();
        const path = jsUrl[2] || jsUrl[5] || jsUrl[8];
        if (!path || !isLocalReference(path)) continue;
        addEndpoint(apiEndpoints, method, path, withoutRoot, 'AJAX');

        const target = resolveReferencedPath(withoutRoot, path, knownRelativePaths);
        if (target) addDependencyEdge(dependencyEdges, withoutRoot, target);
      }
    }

    // Basic API endpoint extraction (regex-based, language-specific)
    if (lang === 'JS' || lang === 'TS') {
      // Express / router style: app.get('/x') / router.post("/x")
      const routeRe = /\b(app|router)\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(\s*(['"`])([^'"`]+)\3/gi;
      let m: RegExpExecArray | null;
      while ((m = routeRe.exec(text))) {
        apiEndpoints.push({
          method: m[2].toUpperCase(),
          path: m[4],
          sourceFile: withoutRoot,
          framework: frameworks.js.includes('Express') ? 'Express' : undefined,
        });
      }

      // router.route('/x').get(...).post(...)
      const routeChainRe = /\brouter\s*\.\s*route\s*\(\s*(['"`])([^'"`]+)\1\s*\)/gi;
      while ((m = routeChainRe.exec(text))) {
        const p = m[2];
        const tail = text.slice(m.index, m.index + 400);
        const methRe = /\.\s*(get|post|put|delete|patch|options|head)\s*\(/gi;
        const methods = new Set<string>();
        let mm: RegExpExecArray | null;
        while ((mm = methRe.exec(tail))) methods.add(mm[1].toUpperCase());
        if (methods.size === 0) methods.add('GET');
        for (const method of methods) {
          apiEndpoints.push({
            method,
            path: p,
            sourceFile: withoutRoot,
            framework: frameworks.js.includes('Express') ? 'Express' : undefined,
          });
        }
      }

      // Fastify full declaration: fastify.route({ method: 'GET', url: '/x' })
      const fastifyRouteRe =
        /\bfastify\s*\.\s*route\s*\(\s*\{[\s\S]*?\bmethod\s*:\s*(?:\[\s*)?(['"`])([A-Za-z]+)\1(?:\s*\])?[\s\S]*?\b(?:url|path)\s*:\s*(['"`])([^'"`]+)\3/gi;
      while ((m = fastifyRouteRe.exec(text))) {
        apiEndpoints.push({
          method: m[2].toUpperCase(),
          path: m[4],
          sourceFile: withoutRoot,
          framework: 'Fastify',
        });
      }

      // Next.js API Routes (Pages Router): pages/api/**
      const pagesApiMatch = withoutRoot.match(/(?:^|\/)(?:src\/)?pages\/api\/(.+)\.(?:ts|tsx|js|jsx)$/i);
      if (pagesApiMatch) {
        const routePart = pagesApiMatch[1];
        let routePath = routePart.replace(/\/index$/i, '').replace(/^index$/i, '');
        routePath = routePath
          .replace(/\[\.\.\.([^\]]+)\]/g, (_m, p1) => `:${p1}*`)
          .replace(/\[([^\]]+)\]/g, (_m, p1) => `:${p1}`);
        const fullPath = (`/api/${routePath}`).replace(/\/+$/, '') || '/api';

        const methodSet = new Set<string>();
        const reqMethodRe = /\breq\.method\s*===\s*['"`]([A-Za-z]+)['"`]/g;
        let rm: RegExpExecArray | null;
        while ((rm = reqMethodRe.exec(text))) methodSet.add(rm[1].toUpperCase());
        const caseRe = /\bcase\s+['"`]([A-Za-z]+)['"`]\s*:/g;
        while ((rm = caseRe.exec(text))) methodSet.add(rm[1].toUpperCase());

        const methods = methodSet.size ? Array.from(methodSet) : ['ANY'];
        for (const method of methods) {
          apiEndpoints.push({ method, path: fullPath, sourceFile: withoutRoot, framework: 'Next.js' });
        }
      }

      // Next.js Route Handlers (App Router): app/**/route.ts
      const appApiMatch = withoutRoot.match(/(?:^|\/)(?:src\/)?app\/(.+)\/route\.(?:ts|js)$/i);
      if (appApiMatch) {
        const routePart = appApiMatch[1];
        const routePath = routePart
          .replace(/\[\.\.\.([^\]]+)\]/g, (_m, p1) => `:${p1}*`)
          .replace(/\[([^\]]+)\]/g, (_m, p1) => `:${p1}`);
        const fullPath = (`/${routePath}`).replace(/\/+$/, '') || '/';

        const methodSet = new Set<string>();
        
        // Match: export [async] function GET(...)
        const funcRe = /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
        let match: RegExpExecArray | null;
        while ((match = funcRe.exec(text))) {
          methodSet.add(match[1].toUpperCase());
        }

        // Match: export const/let/var GET = ...
        const varRe = /\bexport\s+(?:const|let|var)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b\s*=\s*/g;
        while ((match = varRe.exec(text))) {
          methodSet.add(match[1].toUpperCase());
        }

        const methods = methodSet.size ? Array.from(methodSet) : ['ANY'];
        for (const method of methods) {
          apiEndpoints.push({ method, path: fullPath, sourceFile: withoutRoot, framework: 'Next.js' });
        }
      }
    } else if (lang === 'PHP') {
      const includeRe = /\b(?:include|require)(?:_once)?\s*(?:\(?\s*)?(?:__DIR__\s*\.\s*)?(['"])([^'"]+\.(?:php|inc|html?))\1/gi;
      let inc: RegExpExecArray | null;
      while ((inc = includeRe.exec(text))) {
        const target = resolveReferencedPath(withoutRoot, inc[2], knownRelativePaths);
        if (target) addDependencyEdge(dependencyEdges, withoutRoot, target);
      }

      // Laravel: Route::get('path', ...)
      const laravelRouteRe = /\bRoute::\s*(get|post|put|delete|patch|options|match)\s*\(\s*(['"`])([^'"`]+)\2/gi;
      let m: RegExpExecArray | null;
      while ((m = laravelRouteRe.exec(text))) {
        const method = m[1].toUpperCase() === 'MATCH' ? 'MATCH' : m[1].toUpperCase();
        addEndpoint(apiEndpoints, method, m[3], withoutRoot, frameworks.php !== 'Vanilla' ? frameworks.php : undefined);
      }

      // Laravel resource routes (approx): Route::apiResource('users', ...)
      const apiResRe = /\bRoute::\s*apiResource\s*\(\s*(['"`])([^'"`]+)\1/gi;
      while ((m = apiResRe.exec(text))) {
        const base = m[2].startsWith('/') ? m[2] : `/${m[2]}`;
        const idSeg = '{id}';
        [
          ['GET', base],
          ['POST', base],
          ['GET', `${base}/${idSeg}`],
          ['PUT', `${base}/${idSeg}`],
          ['PATCH', `${base}/${idSeg}`],
          ['DELETE', `${base}/${idSeg}`],
        ].forEach(([method, path]) => {
          addEndpoint(apiEndpoints, method, path, withoutRoot, frameworks.php !== 'Vanilla' ? frameworks.php : undefined);
        });
      }

      if (isPublicPageLike(withoutRoot)) {
        for (const method of inferPhpPageMethods(text)) {
          addEndpoint(apiEndpoints, method, routeFromFilePath(withoutRoot), withoutRoot, frameworks.php !== 'Vanilla' ? frameworks.php : 'PHP Page');
        }
      }
    } else if (lang === 'HTML' && isPublicPageLike(withoutRoot)) {
      addEndpoint(apiEndpoints, 'GET', routeFromFilePath(withoutRoot), withoutRoot, 'HTML Page');
    } else if (lang === 'Python') {
      // FastAPI: @app.get("/x") / Flask: @app.route('/x', methods=['GET'])
      const fastApiRe = /@(?:\w+\.)?(get|post|put|delete|patch|options|head)\s*\(\s*(['"])([^'"]+)\2/gi;
      let m: RegExpExecArray | null;
      while ((m = fastApiRe.exec(text))) {
        apiEndpoints.push({
          method: m[1].toUpperCase(),
          path: m[3],
          sourceFile: withoutRoot,
          framework: frameworks.python !== 'Vanilla' ? frameworks.python : undefined,
        });
      }

      const flaskRouteRe = /@(?:\w+\.)?route\s*\(\s*(['"])([^'"]+)\1([^)]*)\)/gi;
      while ((m = flaskRouteRe.exec(text))) {
        const params = m[3] || '';
        const methodsMatch = params.match(/methods\s*=\s*\[([^\]]+)\]/i);
        const methodsRaw = methodsMatch?.[1] || '';
        const methods = methodsRaw
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, '').toUpperCase())
          .filter(Boolean);
        if (methods.length === 0) methods.push('GET');
        for (const method of methods) {
          apiEndpoints.push({
            method,
            path: m[2],
            sourceFile: withoutRoot,
            framework: 'Flask',
          });
        }
      }
    }
  };

  const concurrency = 20;
  for (let i = 0; i < relevant.length; i += concurrency) {
    const batch = relevant.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (f) => {
        await analyzeOne(f);
        processed += 1;
        options.onProgress?.(processed, relevant.length, f.webkitRelativePath || f.name);
      }),
    );
  }

  const totalLOC = Array.from(langStats.values()).reduce((sum, s) => sum + s.loc, 0);


  const frameworkForLang = (lang: string): string => {
    if (lang === 'JS' || lang === 'TS') {
      // If package.json was detected and a framework found, use it; else meaningful default
      return frameworks.js !== 'Vanilla' ? frameworks.js : (lang === 'TS' ? 'TypeScript' : 'JavaScript');
    }
    if (lang === 'PHP') return frameworks.php !== 'Vanilla' ? frameworks.php : 'PHP';
    if (lang === 'Python') return frameworks.python !== 'Vanilla' ? frameworks.python : 'Python';
    if (lang === 'CSS') return 'Stylesheet';
    if (lang === 'HTML') return 'HTML5 Markup';
    if (lang === 'JSON') return 'Config / Data';
    if (lang === 'YAML') return 'Config / IaC';
    if (lang === 'TOML') return 'Config';
    if (lang === 'SQL') return 'Database';
    if (lang === 'Markdown') return 'Documentation';
    if (lang === 'Ruby') return 'Ruby';
    if (lang === 'Go') return 'Go';
    if (lang === 'Rust') return 'Rust';
    if (lang === 'Java') return 'Java';
    if (lang === 'Kotlin') return 'Kotlin';
    if (lang === 'C#') return 'C#';
    if (lang === 'Swift') return 'Swift';
    if (lang === 'C' || lang === 'C++' || lang === 'C/C++') return lang;
    return lang; // safe fallback: use lang name itself, never 'Vanilla'
  };


  const techStack: TechStackItem[] = Array.from(langStats.entries())
    .map(([lang, s]) => {
      const penalty = Math.min(s.securityPenalty, 100);
      const security = clamp(100 - penalty, 0, 100);
      return { lang, count: s.count, loc: s.loc, framework: frameworkForLang(lang), security };
    })
    .sort((a, b) => b.loc - a.loc)
    .slice(0, 8);

  const weightedSecurity =
    techStack.reduce((sum, t) => sum + t.security * (t.loc || 1), 0) /
    Math.max(1, techStack.reduce((sum, t) => sum + (t.loc || 1), 0));
  const score = Math.round(clamp(weightedSecurity, 0, 100));

  let edgePairs: Array<[string, string]> = Array.from(dependencyEdges).map((e) => {
    const [from, to] = e.split('-->');
    return [from, to];
  });
  if (edgePairs.length === 0) {
    edgePairs = Array.from(architectureGroups.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([group, count]): [string, string] => ['Project', `${group} (${count})`]);
  }
  const dependencyGraph = makeDependencyMermaid(edgePairs);

  const uniqueEndpoints = (() => {
    const seen = new Set<string>();
    const out: typeof apiEndpoints = [];
    for (const e of apiEndpoints) {
      const k = `${e.method}|${e.path}|${e.sourceFile}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  })();

  const endpointsCount = uniqueEndpoints.length;
  const securityCount = Array.from(securityHitsByRule.values()).reduce((sum, r) => sum + r.count, 0);
  const riskCount = Array.from(riskHitsByRule.values()).reduce((sum, r) => sum + r.count, 0);
  const summary = `Local analysis complete for ${projectName}: ${relevant.length} files analyzed, ${totalLOC.toLocaleString()} LOC, ${endpointsCount} API-like routes detected, ${securityCount} security signals, ${riskCount} risk signals.`;

  const makeFindings = (
    map: Map<string, { id: string; severity: 'high' | 'medium' | 'low'; title: string; description: string; count: number; files: Set<string> }>,
  ) =>
    Array.from(map.values())
    .map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title,
      description: r.description,
      count: r.count,
      files: Array.from(r.files).slice(0, 20),
    }))
    .sort((a, b) => {
      const w: Record<typeof a.severity, number> = { high: 0, medium: 1, low: 2 };
      return w[a.severity] - w[b.severity] || b.count - a.count;
    });

  const securityFindings = makeFindings(securityHitsByRule);
  const riskFindings = makeFindings(riskHitsByRule);

  const exampleLineById = (id: string) => securityHitsByRule.get(id)?.example || riskHitsByRule.get(id)?.example;

  const optimizations: DocData['optimizations'] = [];
  for (const f of [...securityFindings, ...riskFindings]) {
    if (f.id === 'js_eval' || f.id === 'js_new_function') {
      const original = exampleLineById(f.id) || `// Avoid\nconst out = eval(userInput);`;
      optimizations.push({
        id: `opt_${f.id}`,
        title: 'Remove dynamic code execution',
        priority: 'high',
        rationale: 'Avoid eval()/new Function() to reduce injection risk and improve maintainability.',
        relatedLangs: ['JS', 'TS'],
        example: {
          original,
          optimized: `// Prefer explicit parsing/whitelisting\nconst out = safeParse(userInput);`,
        },
      });
    }
    if (f.id === 'php_mysql_query') {
      const original = exampleLineById(f.id) || '$data = mysql_query("SELECT * FROM users WHERE id=$id");';
      optimizations.push({
        id: 'opt_php_pdo',
        title: 'Replace mysql_query() with PDO/ORM',
        priority: 'high',
        rationale: 'Deprecated API and SQL injection risk; prefer parameterized queries.',
        relatedLangs: ['PHP'],
        example: {
          original,
          optimized: `$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');\n$stmt->execute([$id]);`,
        },
      });
    }
    if (f.id === 'react_dangerous_html' || f.id === 'js_innerhtml') {
      const original = exampleLineById(f.id);
      optimizations.push({
        id: `opt_${f.id}`,
        title: 'Sanitize HTML injection points',
        priority: 'medium',
        rationale: 'Where HTML injection is required, sanitize input and avoid direct innerHTML when possible.',
        relatedLangs: ['JS', 'TS'],
        ...(original
          ? {
              example: {
                original,
                optimized: `// Sanitize any untrusted input before injecting HTML\nconst safe = sanitize(untrustedHtml);\nel.innerHTML = safe;`,
              },
            }
          : {}),
      });
    }
    if (
      f.id === 'secret_private_key' ||
      f.id === 'secret_github_pat' ||
      f.id === 'secret_aws_access_key_id' ||
      f.id === 'secret_generic_assignment'
    ) {
      const original = exampleLineById(f.id) || '<hardcoded secret detected>';
      optimizations.push({
        id: `opt_${f.id}`,
        title: 'Remove hardcoded secrets from source',
        priority: 'high',
        rationale: 'Move secrets/keys to environment variables or a secrets manager and rotate any exposed credentials.',
        relatedLangs: ['JS', 'TS', 'PHP', 'Python'],
        example: {
          original,
          optimized: `// Load secrets from environment (or a secrets manager)\nconst secret = process.env.SECRET_VALUE;`,
        },
      });
    }
    if (f.id === 'js_console') {
      const original = exampleLineById(f.id) || 'console.log(value);';
      optimizations.push({
        id: 'opt_js_logging',
        title: 'Replace console.* with structured logging',
        priority: 'low',
        rationale: 'Reduce noisy logs and prevent accidental leakage by using a logger with levels and redaction.',
        relatedLangs: ['JS', 'TS'],
        example: {
          original,
          optimized: `// Prefer a logger with levels + redaction\nlogger.info({ value }, 'message');`,
        },
      });
    }
    if (f.id === 'js_debugger') {
      const original = exampleLineById(f.id) || 'debugger;';
      optimizations.push({
        id: 'opt_js_debugger',
        title: 'Remove debugger statements',
        priority: 'medium',
        rationale: 'Ensure production builds do not include debugger statements that can pause execution.',
        relatedLangs: ['JS', 'TS'],
        example: { original, optimized: `// Remove debugger statements before shipping\n// debugger;` },
      });
    }
    if (f.id === 'ts_any') {
      const original = exampleLineById(f.id) || 'const value: any = input as any;';
      optimizations.push({
        id: 'opt_ts_types',
        title: 'Reduce TypeScript any usage',
        priority: 'medium',
        rationale: 'Replace any with proper types (or unknown + narrowing) to catch bugs earlier.',
        relatedLangs: ['TS'],
        example: {
          original,
          optimized: `// Prefer unknown + narrowing\nconst value: unknown = input;\nif (typeof value === 'string') {\n  // ...\n}`,
        },
      });
    }
    if (f.id === 'todo_fixme') {
      const original = exampleLineById(f.id) || '// TODO: follow up';
      optimizations.push({
        id: 'opt_todo',
        title: 'Triage TODO/FIXME markers',
        priority: 'low',
        rationale: 'Convert TODO/FIXME into tracked issues with owners and deadlines to avoid silent risk accumulation.',
        relatedLangs: techStack.map((t) => t.lang),
        example: {
          original,
          optimized: `// Convert TODO/FIXME into a tracked issue:\n// ISSUE: <ticket-id> owner=<name> due=<date>`,
        },
      });
    }
  }

  if (apiEndpoints.length === 0) {
    optimizations.push({
      id: 'opt_api_discovery',
      title: 'Add API discovery rules',
      priority: 'low',
      rationale: 'No API routes detected; if this is a backend repo, consider adding framework-specific scanners (Express/Laravel/Django).',
      relatedLangs: techStack.map((t) => t.lang),
    });
  }

  return {
    projectName,
    stats: {
      total: files.length,
      analyzed: relevant.length,
      totalLOC,
    },
    techStack,
    summary,
    guide: [],
    health: { score, grade: gradeFromScore(score) },
    dependencyGraph,
    api: { endpoints: uniqueEndpoints.slice(0, 200) },
    risk: { findings: riskFindings },
    security: { findings: securityFindings },
    optimizations,
  };
};
