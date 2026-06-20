<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const MAX_FILES = 5000;
const MAX_FILE_BYTES = 2000000; // 2MB

$raw = file_get_contents('php://input');
$input = is_string($raw) ? json_decode($raw, true) : null;
if (!is_array($input)) {
    $input = $_POST;
}

$repoUrl = isset($input['repoUrl']) && is_string($input['repoUrl']) ? trim($input['repoUrl']) : '';
if ($repoUrl === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing repoUrl']);
    exit;
}

// Support common SSH-style git URLs like: git@github.com:owner/repo.git
if (preg_match('/^git@([^:]+):(.+)$/i', $repoUrl, $m)) {
    $repoUrl = 'https://' . $m[1] . '/' . $m[2];
}

// If no scheme present, assume HTTPS (covers plain "github.com/owner/repo")
if (!preg_match('~^https?://~i', $repoUrl)) {
    $repoUrl = 'https://' . $repoUrl;
}

if (filter_var($repoUrl, FILTER_VALIDATE_URL) === false) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid repoUrl']);
    exit;
}

$parts = parse_url($repoUrl);
$host = strtolower($parts['host'] ?? '');
$path = $parts['path'] ?? '';
$path = is_string($path) ? rtrim($path, '/') : '';

$allowedHosts = ['github.com', 'gitlab.com'];
if (!in_array($host, $allowedHosts, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Only github.com and gitlab.com URLs are supported right now']);
    exit;
}

if ($path === '' || $path === '/') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'repoUrl path is empty']);
    exit;
}

// Normalize common "web UI" URLs like:
// - GitHub: /owner/repo/tree/main -> /owner/repo
// - GitLab: /group/sub/repo/-/tree/main -> /group/sub/repo
$pathParts = array_values(array_filter(explode('/', $path), fn($p) => $p !== ''));

if ($host === 'github.com') {
    if (count($pathParts) < 2) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'GitHub URL must be in the form github.com/<owner>/<repo>']);
        exit;
    }
    $owner = $pathParts[0];
    $repo = $pathParts[1];
    $repo = preg_replace('~\\.git$~', '', $repo) ?: $repo;
    $path = '/' . $owner . '/' . $repo;
} else if ($host === 'gitlab.com') {
    $dashIdx = array_search('-', $pathParts, true);
    $repoParts = $dashIdx === false ? $pathParts : array_slice($pathParts, 0, $dashIdx);
    if (count($repoParts) < 2) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'GitLab URL must be in the form gitlab.com/<group>/<project>']);
        exit;
    }
    $last = $repoParts[count($repoParts) - 1];
    $repoParts[count($repoParts) - 1] = preg_replace('~\\.git$~', '', $last) ?: $last;
    $path = '/' . implode('/', $repoParts);
}

if (!str_ends_with($path, '.git')) {
    $path .= '.git';
}

$cloneUrl = "https://{$host}{$path}";

$repoName = basename($path);
$repoName = preg_replace('~\\.git$~', '', $repoName) ?: 'repo';

$tmpBase = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gemma-doc-pro';
if (!is_dir($tmpBase)) {
    @mkdir($tmpBase, 0700, true);
}

$jobDir = $tmpBase . DIRECTORY_SEPARATOR . 'job_' . bin2hex(random_bytes(8));
@mkdir($jobDir, 0700, true);
$repoDir = $jobDir . DIRECTORY_SEPARATOR . 'repo';

// Register shutdown function to guarantee directory cleanup on script completion or crash
register_shutdown_function(function() use ($jobDir) {
    cleanup_dir($jobDir);
});

try {
    // Guard: proc_open must not be in disable_functions (common XAMPP restriction)
    $disabledFns = array_map('trim', explode(',', ini_get('disable_functions') ?: ''));
    if (in_array('proc_open', $disabledFns, true)) {
        http_response_code(500);
        echo json_encode([
            'ok' => false,
            'error' => 'Server configuration error',
            'details' => 'proc_open is disabled in php.ini. Remove it from disable_functions in your XAMPP php.ini to enable GitHub sync.',
        ]);
        cleanup_dir($jobDir);
        exit;
    }

    // Guard: confirm the job directory is writable before attempting git clone
    if (!is_dir($jobDir) || !is_writable($jobDir)) {
        http_response_code(500);
        echo json_encode([
            'ok' => false,
            'error' => 'Server write permission error',
            'details' => 'PHP cannot write to the temp directory (' . $jobDir . '). Grant write access to the Apache user (e.g. _www on macOS) or change sys_get_temp_dir() target.',
        ]);
        cleanup_dir($jobDir);
        exit;
    }

    // Locate git binary (handle environments where PATH may be restricted for the PHP process)
    $isWin = (str_starts_with(strtoupper(PHP_OS), 'WIN') || stripos(PHP_OS, 'WIN') === 0);
    $gitBin = '';
    if ($isWin) {
        $whereGit = trim(@shell_exec('where git') ?: '');
        if ($whereGit !== '') {
            $lines = explode("\n", str_replace("\r", "", $whereGit));
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line !== '' && is_executable($line)) {
                    $gitBin = $line;
                    break;
                }
            }
        }
        if ($gitBin === '') {
            // Common Windows installation paths for XAMPP / local setups
            $winPaths = [
                'C:\\Program Files\\Git\\cmd\\git.exe',
                'C:\\Program Files\\Git\\bin\\git.exe',
                'C:\\Program Files\\Git\\mingw64\\bin\\git.exe',
                'C:\\Git\\cmd\\git.exe',
                'C:\\Git\\bin\\git.exe',
                'C:\\xampp\\git\\bin\\git.exe'
            ];
            foreach ($winPaths as $p) {
                if (is_executable($p)) {
                    $gitBin = $p;
                    break;
                }
            }
        }
    } else {
        $gitBin = trim(@shell_exec('which git') ?: '');
        if ($gitBin === '' || !is_executable($gitBin)) {
            foreach (['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git', '/c/Program Files/Git/bin/git'] as $p) {
                if (is_executable($p)) {
                    $gitBin = $p;
                    break;
                }
            }
        }
    }

    if ($gitBin === '' || !is_executable($gitBin)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'git not found', 'details' => 'git binary not found on server; ensure git is installed and PHP can execute it']);
        cleanup_dir($jobDir);
        exit;
    }

    // Harden git clone command to prevent shell parameter or command injection by using a process argument array
    $cloneCmd = [$gitBin, 'clone', '--depth', '1', '--single-branch', '--quiet', $cloneUrl, $repoDir];
    $clone = run_cmd($cloneCmd, $jobDir);
    if ($clone['code'] !== 0) {
        http_response_code(400);
        // Improve error messaging for common failures
        $details = $clone['stderr'] ?: $clone['stdout'];
        if (stripos($details, 'not found') !== false || stripos($details, 'could not resolve host') !== false) {
            $details = "Network or host resolution issue: " . $details;
        } elseif (stripos($details, 'permission denied') !== false || stripos($details, 'authentication') !== false) {
            $details = "Authentication failed or repository is private: " . $details;
        }
        echo json_encode(['ok' => false, 'error' => 'git clone failed', 'details' => $details]);
        cleanup_dir($jobDir);
        exit;
    }

    $analysis = analyze_repo_dir($repoDir, $repoName);
    echo json_encode(['ok' => true, 'data' => $analysis], JSON_UNESCAPED_SLASHES);
    cleanup_dir($jobDir);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error', 'details' => $e->getMessage()]);
    cleanup_dir($jobDir);
}

function run_cmd(string|array $cmd, string $cwd): array
{
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = proc_open($cmd, $descriptors, $pipes, $cwd);
    if (!is_resource($proc)) {
        return ['code' => 1, 'stdout' => '', 'stderr' => 'Failed to start process'];
    }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]) ?: '';
    $stderr = stream_get_contents($pipes[2]) ?: '';
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    return ['code' => is_int($code) ? $code : 1, 'stdout' => $stdout, 'stderr' => $stderr];
}

function cleanup_dir(string $dir): void
{
    if (!is_dir($dir)) return;
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($it as $f) {
        /** @var SplFileInfo $f */
        if ($f->isDir()) @rmdir($f->getPathname());
        else @unlink($f->getPathname());
    }
    @rmdir($dir);
}

function analyze_repo_dir(string $repoDir, string $repoName): array
{
    $ignoreDirs = [
        'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.cache', 'coverage', 'vendor',
        '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'target', '.terraform', '.pytest_cache', '.mypy_cache',
    ];
    $ignoreSet = array_fill_keys($ignoreDirs, true);

    $extToLang = [
        'js' => 'JS', 'jsx' => 'JS', 'mjs' => 'JS', 'cjs' => 'JS',
        'ts' => 'TS', 'tsx' => 'TS', 'mts' => 'TS', 'cts' => 'TS',
        'php' => 'PHP', 'py' => 'Python', 'rb' => 'Ruby', 'go' => 'Go', 'rs' => 'Rust',
        'java' => 'Java', 'kt' => 'Kotlin', 'cs' => 'C#',
        'json' => 'JSON', 'md' => 'Markdown',
        'css' => 'CSS', 'scss' => 'CSS',
        'html' => 'HTML', 'htm' => 'HTML',
        'yml' => 'YAML', 'yaml' => 'YAML', 'toml' => 'TOML', 'sql' => 'SQL',
    ];

    $securityRules = [
        [
            'id' => 'js_eval',
            'severity' => 'high',
            'title' => 'Dynamic code execution (eval)',
            'description' => 'Use of eval() can enable code injection and makes code harder to audit.',
            'langs' => ['JS', 'TS'],
            're' => '/\\beval\\s*\\(/',
            'penalty' => 10,
        ],
        [
            'id' => 'js_new_function',
            'severity' => 'high',
            'title' => 'Dynamic code execution (new Function)',
            'description' => 'new Function() evaluates code at runtime and can enable injection.',
            'langs' => ['JS', 'TS'],
            're' => '/\\bnew\\s+Function\\s*\\(/',
            'penalty' => 10,
        ],
        [
            'id' => 'js_innerhtml',
            'severity' => 'medium',
            'title' => 'Unsafe HTML injection (innerHTML)',
            'description' => 'Assigning to innerHTML can introduce XSS if the content is not sanitized.',
            'langs' => ['JS', 'TS'],
            're' => '/\\.innerHTML\\s*=/',
            'penalty' => 5,
        ],
        [
            'id' => 'react_dangerous_html',
            'severity' => 'medium',
            'title' => 'Unsafe HTML injection (dangerouslySetInnerHTML)',
            'description' => 'dangerouslySetInnerHTML can introduce XSS if content is not sanitized.',
            'langs' => ['JS', 'TS'],
            're' => '/\\bdangerouslySetInnerHTML\\b/',
            'penalty' => 5,
        ],
        [
            'id' => 'php_mysql_query',
            'severity' => 'high',
            'title' => 'Deprecated MySQL API (mysql_query)',
            'description' => 'mysql_* APIs are deprecated/removed; prefer PDO/MySQLi with parameterized queries.',
            'langs' => ['PHP'],
            're' => '/\\bmysql_query\\s*\\(/',
            'penalty' => 10,
        ],
        [
            'id' => 'php_eval',
            'severity' => 'high',
            'title' => 'Dynamic code execution (eval in PHP)',
            'description' => 'PHP eval() executes arbitrary code and is high risk.',
            'langs' => ['PHP'],
            're' => '/\\beval\\s*\\(/',
            'penalty' => 10,
        ],
        [
            'id' => 'py_eval',
            'severity' => 'high',
            'title' => 'Dynamic code execution (eval in Python)',
            'description' => 'Python eval() executes arbitrary code and is high risk.',
            'langs' => ['Python'],
            're' => '/\\beval\\s*\\(/',
            'penalty' => 10,
        ],
        [
            'id' => 'py_exec',
            'severity' => 'high',
            'title' => 'Dynamic code execution (exec in Python)',
            'description' => 'Python exec() executes arbitrary code and is high risk.',
            'langs' => ['Python'],
            're' => '/\\bexec\\s*\\(/',
            'penalty' => 10,
        ],
        [
            'id' => 'secret_private_key',
            'severity' => 'high',
            'title' => 'Private key material committed',
            'description' => 'Private keys should never be committed to source control; move to a secret manager and rotate immediately.',
            'langs' => ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'HTML', 'CSS', 'YAML', 'TOML', 'JSON', 'SQL', 'Markdown'],
            're' => '/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/',
            'penalty' => 10,
        ],
        [
            'id' => 'secret_github_pat',
            'severity' => 'high',
            'title' => 'Hardcoded GitHub token',
            'description' => 'GitHub Personal Access Tokens should not be committed; use environment variables or a secret manager.',
            'langs' => ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'HTML', 'CSS', 'YAML', 'TOML', 'JSON', 'SQL', 'Markdown'],
            're' => '/\\bgh[pousr]_[A-Za-z0-9_]{20,520}\\b/',
            'penalty' => 10,
        ],
        [
            'id' => 'secret_aws_access_key_id',
            'severity' => 'high',
            'title' => 'Hardcoded AWS access key id',
            'description' => 'AWS access keys must not be committed; rotate keys and use IAM roles or secret managers.',
            'langs' => ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'HTML', 'CSS', 'YAML', 'TOML', 'JSON', 'SQL', 'Markdown'],
            're' => '/\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b/',
            'penalty' => 10,
        ],
        [
            'id' => 'secret_generic_assignment',
            'severity' => 'medium',
            'title' => 'Potential hardcoded secret',
            'description' => 'Potential credentials detected in source; validate and move secrets to env/secret manager.',
            'langs' => ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'HTML', 'YAML', 'TOML', 'JSON', 'SQL'],
            're' => '/\\b(?:api[_-]?key|secret|token|password)\\b\\s*[:=]\\s*([\\\'"`])([^\\\'"`]{8,})\\1/i',
            'penalty' => 5,
        ],
    ];

    $riskRules = [
        [
            'id' => 'todo_fixme',
            'severity' => 'low',
            'title' => 'Outstanding TODO/FIXME markers',
            'description' => 'TODO/FIXME markers indicate unfinished work that can become production risk if forgotten.',
            'langs' => ['JS', 'TS', 'PHP', 'Python', 'Ruby', 'Go', 'Rust', 'Java', 'Kotlin', 'C#', 'HTML', 'CSS', 'YAML', 'TOML', 'Markdown'],
            're' => '/\\b(TODO|FIXME)\\b/',
        ],
        [
            'id' => 'js_console',
            'severity' => 'low',
            'title' => 'Debug logging in source',
            'description' => 'console.* calls can leak sensitive info and increase noise; prefer structured logging with levels and redaction.',
            'langs' => ['JS', 'TS'],
            're' => '/\\bconsole\\.(?:log|debug|info|warn|error)\\s*\\(/',
        ],
        [
            'id' => 'js_debugger',
            'severity' => 'medium',
            'title' => 'Debugger statements present',
            'description' => 'debugger statements can halt execution in devtools and should be removed from production builds.',
            'langs' => ['JS', 'TS'],
            're' => '/\\bdebugger\\b/',
        ],
        [
            'id' => 'ts_any',
            'severity' => 'medium',
            'title' => 'TypeScript any usage',
            'description' => 'Overuse of any weakens type safety and can hide runtime bugs; prefer unknown + narrowing or proper types.',
            'langs' => ['TS'],
            're' => '/\\b(?:as\\s+any|:\\s*any\\b|<any>|\\bany\\[\\])/',
        ],
        [
            'id' => 'php_debug',
            'severity' => 'low',
            'title' => 'PHP debug output in code',
            'description' => 'var_dump/print_r debugging can expose data; remove or guard by environment.',
            'langs' => ['PHP'],
            're' => '/\\b(?:var_dump|print_r)\\s*\\(/',
        ],
        [
            'id' => 'py_print',
            'severity' => 'low',
            'title' => 'Python print() debugging',
            'description' => 'print() debugging in production paths can leak info and add noise; prefer logging with levels.',
            'langs' => ['Python'],
            're' => '/\\bprint\\s*\\(/',
        ],
    ];

    $frameworks = detect_frameworks($repoDir, $repoName);

    $langStats = [];
    $securityHits = [];
    $riskHits = [];
    $apiEndpoints = [];
    $dependencyEdges = [];
    $architectureGroups = [];

    $totalFiles = 0;
    $analyzedFiles = 0;
    $totalLoc = 0;

    $dirIter = new RecursiveDirectoryIterator($repoDir, FilesystemIterator::SKIP_DOTS);
    $filter = new class($dirIter, $ignoreSet) extends RecursiveFilterIterator {
        private array $ignoreSet;
        public function __construct(RecursiveIterator $it, array $ignoreSet)
        {
            parent::__construct($it);
            $this->ignoreSet = $ignoreSet;
        }
        public function accept(): bool
        {
            /** @var SplFileInfo $current */
            $current = $this->current();
            if ($current->isDir()) {
                return !isset($this->ignoreSet[$current->getFilename()]);
            }
            return true;
        }
        public function getChildren(): RecursiveFilterIterator
        {
            return new self($this->getInnerIterator()->getChildren(), $this->ignoreSet);
        }
    };

    $it = new RecursiveIteratorIterator($filter);

    $fileCountCap = 0;

    foreach ($it as $fileInfo) {
        /** @var SplFileInfo $fileInfo */
        if ($fileInfo->isDir()) continue;
        $filePath = $fileInfo->getPathname();
        $rel = ltrim(str_replace('\\', '/', substr($filePath, strlen($repoDir))), '/');

        $totalFiles++;
        $fileCountCap++;
        if ($fileCountCap > MAX_FILES) break;

        $ext = strtolower(pathinfo($rel, PATHINFO_EXTENSION));
        if ($ext === '') continue;
        if (!isset($extToLang[$ext])) continue;
        if ($fileInfo->getSize() > MAX_FILE_BYTES) continue;

        $lang = $extToLang[$ext];
        $text = @file_get_contents($filePath);
        if (!is_string($text)) continue;

        $nonEmpty = count_non_empty_lines($text);
        $totalLoc += $nonEmpty;
        $analyzedFiles++;

        if (!isset($langStats[$lang])) {
            $langStats[$lang] = ['count' => 0, 'loc' => 0, 'securityPenalty' => 0];
        }
        $langStats[$lang]['count'] += 1;
        $langStats[$lang]['loc'] += $nonEmpty;

        $group = dependency_group($rel);
        $architectureGroups[$group] = ($architectureGroups[$group] ?? 0) + 1;

        foreach ($securityRules as $rule) {
            if (!in_array($lang, $rule['langs'], true)) continue;
            $hits = preg_match_all($rule['re'], $text) ?: 0;
            if ($hits <= 0) continue;

            $langStats[$lang]['securityPenalty'] += $hits * (int)$rule['penalty'];

            if (!isset($securityHits[$rule['id']])) {
                $securityHits[$rule['id']] = [
                    'id' => $rule['id'],
                    'severity' => $rule['severity'],
                    'title' => $rule['title'],
                    'description' => $rule['description'],
                    'count' => 0,
                    'files' => [],
                ];
            }
            if (!isset($securityHits[$rule['id']]['example'])) {
                $ex = example_for_rule((string)$rule['id'], (string)$rule['re'], $text);
                if (is_string($ex) && $ex !== '') $securityHits[$rule['id']]['example'] = $ex;
            }
            $securityHits[$rule['id']]['count'] += $hits;
            if (count($securityHits[$rule['id']]['files']) < 50 && !in_array($rel, $securityHits[$rule['id']]['files'], true)) {
                $securityHits[$rule['id']]['files'][] = $rel;
            }
        }

        foreach ($riskRules as $rule) {
            if (!in_array($lang, $rule['langs'], true)) continue;
            $hits = preg_match_all($rule['re'], $text) ?: 0;
            if ($hits <= 0) continue;

            if (!isset($riskHits[$rule['id']])) {
                $riskHits[$rule['id']] = [
                    'id' => $rule['id'],
                    'severity' => $rule['severity'],
                    'title' => $rule['title'],
                    'description' => $rule['description'],
                    'count' => 0,
                    'files' => [],
                ];
            }
            if (!isset($riskHits[$rule['id']]['example'])) {
                $ex = example_for_rule((string)$rule['id'], (string)$rule['re'], $text);
                if (is_string($ex) && $ex !== '') $riskHits[$rule['id']]['example'] = $ex;
            }
            $riskHits[$rule['id']]['count'] += $hits;
            if (count($riskHits[$rule['id']]['files']) < 50 && !in_array($rel, $riskHits[$rule['id']]['files'], true)) {
                $riskHits[$rule['id']]['files'][] = $rel;
            }
        }

        if ($lang === 'HTML' || $lang === 'PHP') {
            if (preg_match_all('/\\b(src|href|action)\\s*=\\s*([\"\\\'])([^\"\\\']+)\\2/i', $text, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    $attr = strtolower((string)$match[1]);
                    $ref = (string)$match[3];
                    $target = resolve_reference_guess($rel, $ref);
                    if (is_string($target)) add_dependency_edge($dependencyEdges, $rel, $target);

                    if ($attr === 'action' && is_local_reference($ref)) {
                        $method = 'GET';
                        $refPattern = preg_quote($ref, '/');
                        if (preg_match('/<form\\b[^>]*\\bmethod\\s*=\\s*([\"\\\'])(get|post|put|delete|patch)\\1[^>]*\\baction\\s*=\\s*([\"\\\'])' . $refPattern . '\\3/i', $text, $mm)) {
                            $method = strtoupper((string)$mm[2]);
                        } elseif (preg_match('/<form\\b[^>]*\\baction\\s*=\\s*([\"\\\'])' . $refPattern . '\\1[^>]*\\bmethod\\s*=\\s*([\"\\\'])(get|post|put|delete|patch)\\2/i', $text, $mm)) {
                            $method = strtoupper((string)$mm[3]);
                        }
                        add_endpoint($apiEndpoints, $method, $ref !== '' ? $ref : route_from_file_path($rel), $rel, 'HTML Form');
                    }
                }
            }
        }

        if ($lang === 'CSS') {
            if (preg_match_all('/(?:@import\\s+(?:url\\()?|url\\()\\s*([\"\\\']?)([^\"\\\')]+)\\1/i', $text, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    $target = resolve_reference_guess($rel, (string)$match[2]);
                    if (is_string($target)) add_dependency_edge($dependencyEdges, $rel, $target);
                }
            }
        }

        if ($lang === 'JS' || $lang === 'TS') {
            // API routes (Express-ish)
            if (preg_match_all('/\\b(?:app|router)\\s*\\.\\s*(get|post|put|delete|patch|options|head)\\s*\\(\\s*([\"\\\'])([^\"\\\']+)\\2/i', $text, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    add_endpoint($apiEndpoints, strtoupper((string)$match[1]), (string)$match[3], $rel, str_contains($frameworks['js'], 'Express') ? 'Express' : null);
                }
            }

            // Dependency edges (cross top-level dirs)
            if (preg_match_all('/(?:import|export)\\s+(?:type\\s+)?(?:[^\\\"\\\']+\\s+from\\s+)?[\\\"\\\']([^\\\"\\\']+)[\\\"\\\']/', $text, $m)) {
                foreach ($m[1] as $spec) {
                    if (!is_string($spec) || $spec === '' || $spec[0] !== '.') continue;
                    $toRel = resolve_relative_import($rel, $spec);
                    add_dependency_edge($dependencyEdges, $rel, $toRel);
                }
            }

            if (preg_match_all('/\\b(?:fetch|importScripts)\\s*\\(\\s*([\"\\\'])([^\"\\\']+)\\1|\\baxios\\.(get|post|put|delete|patch)\\s*\\(\\s*([\"\\\'])([^\"\\\']+)\\4|\\$\\.(get|post)\\s*\\(\\s*([\"\\\'])([^\"\\\']+)\\7/i', $text, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    $method = strtoupper((string)($match[3] ?? $match[6] ?? 'GET'));
                    $pathStr = (string)($match[2] ?? $match[5] ?? $match[8] ?? '');
                    if ($pathStr === '' || !is_local_reference($pathStr)) continue;
                    add_endpoint($apiEndpoints, $method, $pathStr, $rel, 'AJAX');
                    $target = resolve_reference_guess($rel, $pathStr);
                    if (is_string($target)) add_dependency_edge($dependencyEdges, $rel, $target);
                }
            }
        } elseif ($lang === 'PHP') {
            if (preg_match_all('/\\b(?:include|require)(?:_once)?\\s*(?:\\(?\\s*)?(?:__DIR__\\s*\\.\\s*)?([\"\\\'])([^\"\\\']+\\.(?:php|inc|html?))\\1/i', $text, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    $target = resolve_reference_guess($rel, (string)$match[2]);
                    if (is_string($target)) add_dependency_edge($dependencyEdges, $rel, $target);
                }
            }

            // Laravel routes
            if (preg_match_all('/\\bRoute::\\s*(get|post|put|delete|patch|options|match)\\s*\\(\\s*([\"\\\'])([^\"\\\']+)\\2/i', $text, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    $method = strtoupper($match[1]);
                    add_endpoint($apiEndpoints, $method, (string)$match[3], $rel, $frameworks['php'] !== 'Vanilla' ? $frameworks['php'] : null);
                }
            }

            if (is_public_page_like($rel)) {
                foreach (infer_php_page_methods($text) as $method) {
                    add_endpoint($apiEndpoints, $method, route_from_file_path($rel), $rel, $frameworks['php'] !== 'Vanilla' ? $frameworks['php'] : 'PHP Page');
                }
            }
        } elseif ($lang === 'HTML' && is_public_page_like($rel)) {
            add_endpoint($apiEndpoints, 'GET', route_from_file_path($rel), $rel, 'HTML Page');
        } elseif ($lang === 'Python') {
            // FastAPI-style: @app.get("/x")
            if (preg_match_all('/@(?:\\w+\\.)?(get|post|put|delete|patch|options|head)\\s*\\(\\s*([\"\\\'])([^\"\\\']+)\\2/i', $text, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    $apiEndpoints[] = [
                        'method' => strtoupper($match[1]),
                        'path' => $match[3],
                        'sourceFile' => $rel,
                        'framework' => $frameworks['python'] !== 'Vanilla' ? $frameworks['python'] : null,
                    ];
                }
            }

            // Flask: @app.route('/x', methods=['GET', 'POST'])
            if (preg_match_all('/@(?:\\w+\\.)?route\\s*\\(\\s*([\"\\\'])([^\"\\\']+)\\1([^)]*)\\)/i', $text, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    $pathStr = $match[2];
                    $params = $match[3] ?? '';
                    $methods = [];
                    if (preg_match('/methods\\s*=\\s*\\[([^\\]]+)\\]/i', $params, $mm)) {
                        $methodsRaw = $mm[1] ?? '';
                        foreach (explode(',', $methodsRaw) as $s) {
                            $s = trim($s);
                            $s = preg_replace('/^[\"\\\']|[\"\\\']$/', '', $s);
                            if ($s !== '') $methods[] = strtoupper($s);
                        }
                    }
                    if (count($methods) === 0) $methods = ['GET'];
                    foreach ($methods as $method) {
                        $apiEndpoints[] = [
                            'method' => $method,
                            'path' => $pathStr,
                            'sourceFile' => $rel,
                            'framework' => 'Flask',
                        ];
                    }
                }
            }
        }
    }

    // Build tech stack
    $techStack = [];
    foreach ($langStats as $lang => $s) {
        $penalty = (int)min($s['securityPenalty'], 100);
        $security = max(0, min(100, 100 - $penalty));
        $framework = 'Vanilla';
        if ($lang === 'JS' || $lang === 'TS') $framework = $frameworks['js'];
        if ($lang === 'PHP') $framework = $frameworks['php'];
        if ($lang === 'Python') $framework = $frameworks['python'];

        $techStack[] = [
            'lang' => $lang,
            'count' => (int)$s['count'],
            'loc' => (int)$s['loc'],
            'framework' => $framework,
            'security' => $security,
        ];
    }

    usort($techStack, fn($a, $b) => $b['loc'] <=> $a['loc']);
    $techStack = array_slice($techStack, 0, 8);

    $weightedNumerator = 0.0;
    $weightedDenom = 0.0;
    foreach ($techStack as $t) {
        $w = max(1, (int)$t['loc']);
        $weightedNumerator += (float)$t['security'] * $w;
        $weightedDenom += $w;
    }
    $score = (int)round($weightedDenom > 0 ? ($weightedNumerator / $weightedDenom) : 0);
    $score = max(0, min(100, $score));

    $grade = $score >= 93 ? 'A+' : ($score >= 88 ? 'A' : ($score >= 80 ? 'B' : ($score >= 70 ? 'C' : 'D')));

    // Dependency graph (folder-level)
    $edgePairs = [];
    foreach (array_keys($dependencyEdges) as $e) {
        $parts = explode('-->', $e, 2);
        if (count($parts) === 2) $edgePairs[] = [$parts[0], $parts[1]];
    }
    if (count($edgePairs) === 0) {
        arsort($architectureGroups);
        foreach (array_slice($architectureGroups, 0, 12, true) as $group => $count) {
            $edgePairs[] = ['Project', "{$group} ({$count})"];
        }
    }
    $dependencyGraph = make_dependency_mermaid($edgePairs);

    $securityFindings = array_values($securityHits);
    usort($securityFindings, function ($a, $b) {
        $w = ['high' => 0, 'medium' => 1, 'low' => 2];
        $wa = $w[$a['severity']] ?? 9;
        $wb = $w[$b['severity']] ?? 9;
        if ($wa !== $wb) return $wa <=> $wb;
        return ($b['count'] ?? 0) <=> ($a['count'] ?? 0);
    });

    $riskFindings = array_values($riskHits);
    usort($riskFindings, function ($a, $b) {
        $w = ['high' => 0, 'medium' => 1, 'low' => 2];
        $wa = $w[$a['severity']] ?? 9;
        $wb = $w[$b['severity']] ?? 9;
        if ($wa !== $wb) return $wa <=> $wb;
        return ($b['count'] ?? 0) <=> ($a['count'] ?? 0);
    });

    // API endpoints: dedupe
    $dedup = [];
    $finalEndpoints = [];
    foreach ($apiEndpoints as $ep) {
        $k = ($ep['method'] ?? '') . '|' . ($ep['path'] ?? '') . '|' . ($ep['sourceFile'] ?? '');
        if (isset($dedup[$k])) continue;
        $dedup[$k] = true;
        $finalEndpoints[] = $ep;
    }
    $finalEndpoints = array_slice($finalEndpoints, 0, 200);

    $securityHitsCount = 0;
    foreach ($securityFindings as $f) $securityHitsCount += (int)($f['count'] ?? 0);

    $riskHitsCount = 0;
    foreach ($riskFindings as $f) $riskHitsCount += (int)($f['count'] ?? 0);

    $summary = "Local analysis complete for {$repoName}: {$analyzedFiles} files analyzed, " . number_format($totalLoc) . " LOC, " . count($finalEndpoints) . " API-like routes detected, {$securityHitsCount} security signals, {$riskHitsCount} risk signals.";

    $optimizations = [];
    foreach (array_merge($securityFindings, $riskFindings) as $f) {
        $id = (string)($f['id'] ?? '');
        $original = $id !== '' ? ($securityHits[$id]['example'] ?? $riskHits[$id]['example'] ?? null) : null;

        if ($id === 'js_eval' || $id === 'js_new_function') {
            $optimizations[] = [
                'id' => 'opt_' . $id,
                'title' => 'Remove dynamic code execution',
                'priority' => 'high',
                'rationale' => 'Avoid eval()/new Function() to reduce injection risk and improve maintainability.',
                'relatedLangs' => ['JS', 'TS'],
                'example' => [
                    'original' => is_string($original) && $original !== '' ? $original : "// Avoid\nconst out = eval(userInput);",
                    'optimized' => "// Prefer explicit parsing/whitelisting\nconst out = safeParse(userInput);",
                ],
            ];
        }
        if ($id === 'php_mysql_query') {
            $optimizations[] = [
                'id' => 'opt_php_pdo',
                'title' => 'Replace mysql_query() with PDO/ORM',
                'priority' => 'high',
                'rationale' => 'Deprecated API and SQL injection risk; prefer parameterized queries.',
                'relatedLangs' => ['PHP'],
                'example' => [
                    'original' => is_string($original) && $original !== '' ? $original : '$data = mysql_query("SELECT * FROM users WHERE id=$id");',
                    'optimized' => "\$stmt = \$pdo->prepare('SELECT * FROM users WHERE id = ?');\n\$stmt->execute([\$id]);",
                ],
            ];
        }
        if ($id === 'react_dangerous_html' || $id === 'js_innerhtml') {
            if (is_string($original) && $original !== '') {
                $optimizations[] = [
                    'id' => 'opt_' . $id,
                    'title' => 'Sanitize HTML injection points',
                    'priority' => 'medium',
                    'rationale' => 'Where HTML injection is required, sanitize input and avoid direct innerHTML when possible.',
                    'relatedLangs' => ['JS', 'TS'],
                    'example' => [
                        'original' => $original,
                        'optimized' => "// Sanitize any untrusted input before injecting HTML\nconst safe = sanitize(untrustedHtml);\nel.innerHTML = safe;",
                    ],
                ];
            }
        }
        if (in_array($id, ['secret_private_key', 'secret_github_pat', 'secret_aws_access_key_id', 'secret_generic_assignment'], true)) {
            $optimizations[] = [
                'id' => 'opt_' . ($id !== '' ? $id : 'secrets'),
                'title' => 'Remove hardcoded secrets from source',
                'priority' => 'high',
                'rationale' => 'Move secrets/keys to environment variables or a secrets manager and rotate any exposed credentials.',
                'relatedLangs' => ['JS', 'TS', 'PHP', 'Python'],
                'example' => [
                    'original' => is_string($original) && $original !== '' ? $original : '<hardcoded secret detected>',
                    'optimized' => "// Load secrets from environment (or a secrets manager)\n\$secret = getenv('SECRET_VALUE');",
                ],
            ];
        }
        if ($id === 'js_console') {
            $optimizations[] = [
                'id' => 'opt_js_logging',
                'title' => 'Replace console.* with structured logging',
                'priority' => 'low',
                'rationale' => 'Reduce noisy logs and prevent accidental leakage by using a logger with levels and redaction.',
                'relatedLangs' => ['JS', 'TS'],
                'example' => [
                    'original' => is_string($original) && $original !== '' ? $original : 'console.log(value);',
                    'optimized' => "// Prefer a logger with levels + redaction\nlogger.info({ value }, 'message');",
                ],
            ];
        }
        if ($id === 'js_debugger') {
            $optimizations[] = [
                'id' => 'opt_js_debugger',
                'title' => 'Remove debugger statements',
                'priority' => 'medium',
                'rationale' => 'Ensure production builds do not include debugger statements that can pause execution.',
                'relatedLangs' => ['JS', 'TS'],
                'example' => [
                    'original' => is_string($original) && $original !== '' ? $original : 'debugger;',
                    'optimized' => "// Remove debugger statements before shipping\n// debugger;",
                ],
            ];
        }
        if ($id === 'ts_any') {
            $optimizations[] = [
                'id' => 'opt_ts_types',
                'title' => 'Reduce TypeScript any usage',
                'priority' => 'medium',
                'rationale' => 'Replace any with proper types (or unknown + narrowing) to catch bugs earlier.',
                'relatedLangs' => ['TS'],
                'example' => [
                    'original' => is_string($original) && $original !== '' ? $original : 'const value: any = input as any;',
                    'optimized' => "// Prefer unknown + narrowing\nconst value: unknown = input;\nif (is_string($value)) {\n  // ...\n}",
                ],
            ];
        }
        if ($id === 'todo_fixme') {
            $langs = array_map(fn($t) => $t['lang'], $techStack);
            $optimizations[] = [
                'id' => 'opt_todo',
                'title' => 'Triage TODO/FIXME markers',
                'priority' => 'low',
                'rationale' => 'Convert TODO/FIXME into tracked issues with owners and deadlines to avoid silent risk accumulation.',
                'relatedLangs' => array_values(array_unique($langs)),
                'example' => [
                    'original' => is_string($original) && $original !== '' ? $original : '// TODO: follow up',
                    'optimized' => "// Convert TODO/FIXME into a tracked issue:\n// ISSUE: <ticket-id> owner=<name> due=<date>",
                ],
            ];
        }
    }

    if (count($finalEndpoints) === 0) {
        $langs = array_map(fn($t) => $t['lang'], $techStack);
        $optimizations[] = [
            'id' => 'opt_api_discovery',
            'title' => 'Improve API discovery',
            'priority' => 'low',
            'rationale' => 'No API routes detected; consider adding framework-specific scanners for your backend framework.',
            'relatedLangs' => array_values(array_unique($langs)),
        ];
    }

    return [
        'projectName' => $repoName,
        'stats' => [
            'total' => $totalFiles,
            'analyzed' => $analyzedFiles,
            'totalLOC' => $totalLoc,
        ],
        'techStack' => $techStack,
        'summary' => $summary,
        'guide' => [],
        'health' => ['score' => $score, 'grade' => $grade],
        'dependencyGraph' => $dependencyGraph,
        'api' => ['endpoints' => $finalEndpoints],
        'risk' => ['findings' => $riskFindings],
        'security' => ['findings' => $securityFindings],
        'optimizations' => $optimizations,
    ];
}

function detect_frameworks(string $repoDir, string $repoName): array
{
    $frameworks = ['js' => 'Vanilla', 'php' => 'Vanilla', 'python' => 'Vanilla'];

    $pkgPath = $repoDir . DIRECTORY_SEPARATOR . 'package.json';
    if (is_file($pkgPath)) {
        $pkg = json_decode((string)file_get_contents($pkgPath), true);
        $deps = [];
        if (is_array($pkg['dependencies'] ?? null)) $deps = array_merge($deps, $pkg['dependencies']);
        if (is_array($pkg['devDependencies'] ?? null)) $deps = array_merge($deps, $pkg['devDependencies']);

        $has = fn(string $k) => array_key_exists($k, $deps);
        $detected = [];
        if ($has('next')) $detected[] = 'Next.js';
        if ($has('nuxt') || $has('nuxt3')) $detected[] = 'Nuxt';
        if ($has('@angular/core')) $detected[] = 'Angular';
        if ($has('vue')) $detected[] = 'Vue';
        if ($has('svelte')) $detected[] = 'Svelte';
        if ($has('react')) $detected[] = 'React';
        if ($has('vite')) $detected[] = 'Vite';
        if ($has('express')) $detected[] = 'Express';
        if ($has('fastify')) $detected[] = 'Fastify';
        if ($has('@nestjs/core')) $detected[] = 'NestJS';
        if ($has('koa')) $detected[] = 'Koa';

        if (count($detected) > 0) $frameworks['js'] = implode(' + ', array_slice(array_values(array_unique($detected)), 0, 3));
    }

    $composerPath = $repoDir . DIRECTORY_SEPARATOR . 'composer.json';
    $artisanPath = $repoDir . DIRECTORY_SEPARATOR . 'artisan';
    if (is_file($composerPath)) {
        $composer = json_decode((string)file_get_contents($composerPath), true);
        $req = [];
        if (is_array($composer['require'] ?? null)) $req = array_merge($req, $composer['require']);
        if (is_array($composer['require-dev'] ?? null)) $req = array_merge($req, $composer['require-dev']);

        $has = fn(string $k) => array_key_exists($k, $req);
        if ($has('laravel/framework') || is_file($artisanPath)) $frameworks['php'] = 'Laravel';
        else if ($has('symfony/symfony') || $has('symfony/framework-bundle')) $frameworks['php'] = 'Symfony';
        else if ($has('wordpress/wordpress') || $has('johnpbloch/wordpress')) $frameworks['php'] = 'WordPress';
    } else if (is_file($artisanPath)) {
        $frameworks['php'] = 'Laravel';
    }

    $reqPath = $repoDir . DIRECTORY_SEPARATOR . 'requirements.txt';
    $pyprojectPath = $repoDir . DIRECTORY_SEPARATOR . 'pyproject.toml';
    if (is_file($reqPath)) {
        $txt = strtolower((string)file_get_contents($reqPath));
        if (str_contains($txt, 'django')) $frameworks['python'] = 'Django';
        else if (str_contains($txt, 'flask')) $frameworks['python'] = 'Flask';
        else if (str_contains($txt, 'fastapi')) $frameworks['python'] = 'FastAPI';
    } else if (is_file($pyprojectPath)) {
        $txt = strtolower((string)file_get_contents($pyprojectPath));
        if (str_contains($txt, 'django')) $frameworks['python'] = 'Django';
        else if (str_contains($txt, 'flask')) $frameworks['python'] = 'Flask';
        else if (str_contains($txt, 'fastapi')) $frameworks['python'] = 'FastAPI';
    }

    return $frameworks;
}

function count_non_empty_lines(string $text): int
{
    $len = strlen($text);
    if ($len === 0) return 0;
    $nonEmpty = 0;
    $has = false;

    for ($i = 0; $i < $len; $i++) {
        $c = ord($text[$i]);
        if ($c === 10) {
            if ($has) $nonEmpty++;
            $has = false;
            continue;
        }
        if ($c === 13) {
            $next = ($i + 1 < $len) ? ord($text[$i + 1]) : 0;
            if ($next !== 10) {
                if ($has) $nonEmpty++;
                $has = false;
            }
            continue;
        }
        if ($c === 32 || $c === 9) continue;
        $has = true;
    }
    if ($has) $nonEmpty++;
    return $nonEmpty;
}

function snippet_from_offset(string $text, int $offset, int $maxLen = 220): string
{
    $before = substr($text, 0, max(0, $offset));
    $lineStartPos = strrpos($before, "\n");
    $lineStart = $lineStartPos === false ? 0 : ($lineStartPos + 1);

    $lineEndPos = strpos($text, "\n", max(0, $offset));
    $lineEnd = $lineEndPos === false ? strlen($text) : $lineEndPos;

    $line = trim(substr($text, $lineStart, max(0, $lineEnd - $lineStart)));
    if (strlen($line) > $maxLen) $line = rtrim(substr($line, 0, $maxLen)) . '…';
    return $line;
}

function mask_secret_line(string $ruleId, string $line): string
{
    if ($ruleId === 'secret_github_pat') {
        return preg_replace('/\\b(gh[pousr]_)[A-Za-z0-9_]{8,520}\\b/', '$1<REDACTED>', $line) ?? $line;
    }
    if ($ruleId === 'secret_aws_access_key_id') {
        return preg_replace('/\\b((?:AKIA|ASIA))[0-9A-Z]{16}\\b/', '$1<REDACTED>', $line) ?? $line;
    }
    if ($ruleId === 'secret_generic_assignment') {
        return preg_replace(
            '/\\b(api[_-]?key|secret|token|password)\\b\\s*([:=])\\s*([\\\'"`])([^\\\'"`]{8,})\\3/i',
            '$1$2 $3<REDACTED>$3',
            $line
        ) ?? $line;
    }
    if ($ruleId === 'secret_private_key') {
        return '-----BEGIN PRIVATE KEY----- <REDACTED> -----END PRIVATE KEY-----';
    }
    return $line;
}

function example_for_rule(string $ruleId, string $pattern, string $text): ?string
{
    $m = [];
    if (preg_match($pattern, $text, $m, PREG_OFFSET_CAPTURE) !== 1) return null;
    $offset = $m[0][1] ?? null;
    if (!is_int($offset)) return null;
    $line = snippet_from_offset($text, $offset);
    if (str_starts_with($ruleId, 'secret_')) return mask_secret_line($ruleId, $line);
    return $line;
}

function strip_query_hash(string $value): string
{
    $value = explode('#', $value, 2)[0] ?? '';
    $value = explode('?', $value, 2)[0] ?? '';
    return trim($value);
}

function is_local_reference(string $value): bool
{
    $ref = trim($value);
    if ($ref === '' || str_starts_with($ref, '#')) return false;
    return preg_match('/^(?:[a-z][a-z0-9+.-]*:|\\/\\/)/i', $ref) !== 1;
}

function normalize_route_path(string $path): string
{
    $clean = str_replace('\\', '/', strip_query_hash($path));
    $clean = preg_replace('~^\\./+~', '', $clean) ?? $clean;
    if ($clean === '') return '/';
    if ($clean[0] !== '/') $clean = '/' . $clean;
    return preg_replace('~/+~', '/', $clean) ?? $clean;
}

function route_from_file_path(string $relativePath): string
{
    $clean = str_replace('\\', '/', $relativePath);
    if (preg_match('/^index\\.(?:php|html?)$/i', $clean)) return '/';
    if (preg_match('/\\/index\\.(?:php|html?)$/i', $clean)) {
        $clean = preg_replace('/\\/index\\.(?:php|html?)$/i', '', $clean) ?? $clean;
    }
    return normalize_route_path($clean);
}

function dependency_group(string $relativePath): string
{
    $parts = array_values(array_filter(explode('/', str_replace('\\', '/', $relativePath)), fn($p) => $p !== ''));
    if (count($parts) <= 1) return 'Root Pages';
    return (string)$parts[0];
}

function add_dependency_edge(array &$edges, string $fromPath, string $targetPath): void
{
    $from = dependency_group($fromPath);
    $to = dependency_group($targetPath);
    if ($from === $to) return;
    $edges["{$from}-->{$to}"] = true;
}

function resolve_reference_guess(string $fromPath, string $specifier): ?string
{
    $cleaned = str_replace('\\', '/', strip_query_hash($specifier));
    if (!is_local_reference($cleaned)) return null;
    if ($cleaned === '') return null;
    if ($cleaned[0] === '/') return ltrim($cleaned, '/');
    return resolve_relative_import($fromPath, $cleaned);
}

function is_public_page_like(string $relativePath): bool
{
    $parts = array_values(array_filter(explode('/', str_replace('\\', '/', $relativePath)), fn($p) => $p !== ''));
    $filename = (string)($parts[count($parts) - 1] ?? '');
    if (preg_match('/\\.(?:php|html?)$/i', $filename) !== 1) return false;
    if (preg_match('/^(?:_|\\.|header|footer|sidebar|nav|navbar|config|connection|db|database|functions?)\\./i', $filename) === 1) return false;

    $hidden = array_fill_keys(['includes', 'include', 'inc', 'partials', 'templates', 'components', 'lib', 'libs', 'vendor', 'config', 'classes', 'models', 'migrations', 'tests'], true);
    foreach (array_slice($parts, 0, -1) as $part) {
        if (isset($hidden[strtolower((string)$part)])) return false;
    }
    return true;
}

function infer_php_page_methods(string $text): array
{
    $methods = [];
    if (preg_match('/\\$_(?:POST|FILES)\\b/i', $text) === 1 || preg_match('/REQUEST_METHOD[^\\n]{0,80}POST/i', $text) === 1) $methods[] = 'POST';
    if (preg_match('/\\$_(?:GET|REQUEST)\\b/i', $text) === 1 || preg_match('/REQUEST_METHOD[^\\n]{0,80}GET/i', $text) === 1) $methods[] = 'GET';
    if (count($methods) === 0) $methods[] = 'GET';
    return array_values(array_unique($methods));
}

function add_endpoint(array &$endpoints, string $method, string $path, string $sourceFile, ?string $framework = null): void
{
    $endpoints[] = [
        'method' => strtoupper($method),
        'path' => normalize_route_path($path),
        'sourceFile' => $sourceFile,
        'framework' => $framework,
    ];
}

function resolve_relative_import(string $fromPath, string $specifier): string
{
    $fromPath = str_replace('\\', '/', $fromPath);
    $parts = array_values(array_filter(explode('/', $fromPath), fn($p) => $p !== ''));
    array_pop($parts);
    $spec = array_values(array_filter(explode('/', str_replace('\\', '/', $specifier)), fn($p) => $p !== ''));

    foreach ($spec as $p) {
        if ($p === '.') continue;
        if ($p === '..') array_pop($parts);
        else $parts[] = $p;
    }
    return implode('/', $parts);
}

function make_dependency_mermaid(array $edges): string
{
    if (count($edges) === 0) return "graph TB\n  A[\"No dependency edges detected\"]";

    $nodes = [];
    $nodeId = function (string $label) use (&$nodes): string {
        if (!isset($nodes[$label])) $nodes[$label] = 'N' . (count($nodes) + 1);
        return $nodes[$label];
    };

    $lines = ["graph TB"];
    foreach ($edges as $edge) {
        [$from, $to] = $edge;
        $fromId = $nodeId((string)$from);
        $toId = $nodeId((string)$to);
        $fromLabel = str_replace('"', '\\"', (string)$from);
        $toLabel = str_replace('"', '\\"', (string)$to);
        $lines[] = "  {$fromId}[\"{$fromLabel}\"] --> {$toId}[\"{$toLabel}\"]";
    }
    return implode("\n", $lines);
}
