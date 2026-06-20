# Gemma Doc Pro — AI-Powered Codebase Intelligence Platform

🚀 **Live Application Demo:** [https://sayista-yazdani.github.io/Gemma-Doc-Pro/](https://sayista-yazdani.github.io/Gemma-Doc-Pro/)

> **Transform any codebase into a production-grade developer guide using Gemma 4 AI. Visual architecture maps, security auditing, API surface detection, and smart documentation — all 100% private and browser-native.**

![Live Demo](https://img.shields.io/badge/Live%20Demo-Online-3b82f6?style=for-the-badge&logo=github&logoColor=white)
![Status](https://img.shields.io/badge/Status-Production%20Ready-22c55e?style=for-the-badge)
![React 19](https://img.shields.io/badge/React-19.x-61dafb?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=for-the-badge&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8.x-646cff?style=for-the-badge&logo=vite)
![No Backend Required](https://img.shields.io/badge/Backend-Not%20Required-22c55e?style=for-the-badge)

---

## 📸 Screenshots

### First Dashboard
![Dashboard](gemma-doc-screenshoots/ss-1.png)

### Second Dashboard View
![Security](gemma-doc-screenshoots/ss-2.png)

### First summary Dashboard
![Security](gemma-doc-screenshoots/ss-3.png)

### API Surface Tab
![Graph](gemma-doc-screenshoots/ss-4.png)

### Security Analysis
![Security](gemma-doc-screenshoots/ss-5.png)

### Dependency Graph
![Graph](gemma-doc-screenshoots/ss-7.png)

### Gemma AI Chat
![Graph](gemma-doc-screenshoots/ss-6.png)


## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Architecture](#project-architecture)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [Analysis Capabilities](#analysis-capabilities)
- [QA Test Report](#qa-test-report)
- [Bug Fix History](#bug-fix-history)
- [Security](#security)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## Overview

**Gemma Doc Pro** is a fully browser-based, AI-augmented code intelligence dashboard. It accepts either a **local project folder upload** or a **GitHub public repository URL**, analyzes the source code entirely on your machine, and produces a multi-tab structured report covering:

- Executive summary with LOC, file count, and API surface
- Visual dependency architecture (2D Mermaid graph + 3D neural orbit)
- Detected API endpoints (Express, Next.js, Laravel, FastAPI, Flask)
- Risk analysis and security vulnerability scanning (OWASP-aligned)
- Optimization roadmap with before/after code refactoring diffs
- Bilingual interface (English / Hindi)
- Gemma AI chat for contextual project Q&A

> **No server required.** All analysis runs in the browser. GitHub sync uses the public GitHub REST API directly — no XAMPP, no PHP, no git binary needed.

---

## Key Features

| Feature | Description |
|---|---|
| 🔒 **Privacy-First** | 100% local analysis. No code leaves your machine. |
| 🌐 **GitHub Direct Sync** | Fetches repositories via GitHub REST API — no backend required |
| 🧠 **Multi-Language Detection** | 25+ file types: PHP, JS/TS, Python, Ruby, Go, Rust, Java, HTML, CSS, SQL, YAML, TOML and more |
| 🏷️ **Real Framework Labels** | Detects Next.js, Express, Laravel, Django, Flask, Vue, Angular, NestJS |
| 🔍 **Security Scanning** | OWASP-aligned: eval(), innerHTML, mysql_query(), hardcoded secrets, XSS risks |
| 📡 **API Surface Mapping** | Extracts routes from Express, Next.js (Pages + App Router), Laravel, FastAPI, Flask |
| 🗺️ **Dependency Graph** | Mermaid.js 2D flowchart + interactive 3D orbit visualization with SVG caching |
| 📊 **Health Score** | Weighted security score (0–100) with letter grade (A+ → D) |
| 💬 **Gemma AI Chat** | Keyword-aware assistant with project-specific responses |
| 🌐 **Bilingual UI** | Toggle between English and Hindi for all tab labels |
| 📥 **JSON Export** | Download full audit report as structured JSON |
| ⚡ **Real-time Progress** | File-by-file fetch and analysis progress during scanning |
| ↩️ **Error Recovery** | "Try Again" properly resets state without page reload |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19 + TypeScript (Strict Mode) |
| **Build Tool** | Vite 8 |
| **Animations** | Framer Motion 12 |
| **Icons** | Lucide React |
| **Dependency Graph** | Mermaid.js 11 |
| **Local Analysis Engine** | Custom TypeScript analyzer (`src/lib/analyzer.ts`) |
| **GitHub Integration** | GitHub REST API v3 (browser-native fetch, no auth required for public repos) |
| **Styling** | Vanilla CSS with custom design tokens |
| **Typography** | Inter + Outfit (Google Fonts) |

> ⚠️ `api/analyze_repo.php` is present but **no longer used**. GitHub sync now runs entirely in the browser via `App.tsx → handleRepoAnalyze()`.

---

## Project Architecture

```
Gemma-Doc-Pro/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   └── UIComponents.tsx        # FeatureCard and reusable UI primitives
│   ├── lib/
│   │   └── analyzer.ts             # Core analysis engine
│   │       ├── TechStackItem       # Type: lang, count, loc, framework, security
│   │       ├── DocData             # Type: full audit report shape
│   │       ├── detectFrameworks()  # Reads package.json / composer.json / requirements.txt
│   │       ├── frameworkForLang()  # Maps language → real framework label (no "Vanilla")
│   │       ├── analyzeOne()        # Per-file: LOC, security rules, import extraction
│   │       └── analyzeUploadedProject()  # Entry point: batched async analysis
│   ├── views/
│   │   ├── LandingView.tsx         # Splash/Hero screen
│   │   ├── DashboardView.tsx       # Input panel (GitHub URL sync + local upload)
│   │   └── DocView.tsx             # Main report dashboard (7 tabs + right panel)
│   ├── App.tsx                     # Root router + state management + GitHub API logic
│   ├── index.css                   # Full design system (tokens, grid, typography)
│   └── main.tsx                    # React root mount
├── api/
│   └── analyze_repo.php            # Legacy PHP backend (NOT used — kept for reference only)
├── package.json
├── tsconfig.json
└── vite.config.ts
```



### State Flow

```
LandingView
    ↓ onStart()
DashboardView
    ↓ onFolderSelect(files)     → analyzeUploadedProject(files) → DocData
    ↓ onRepoAnalyze(githubUrl)  → GitHub REST API → synthetic Files → analyzeUploadedProject() → DocData
DocView
    ↓ onBack()
DashboardView (reset, analysisError cleared)
```

### GitHub Sync Flow (browser-only)

```
User enters: github.com/owner/repo
    ↓
Parse URL → extract owner + repo
    ↓
GET api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1
    ↓
Filter: code files only, ignore node_modules/.git/dist/vendor, cap at 300 files
    ↓
Batch fetch (8 concurrent): api.github.com/repos/{owner}/{repo}/contents/{path}
    ↓
base64 decode → new File() with webkitRelativePath = "{repo}/{path}"
    ↓
analyzeUploadedProject(syntheticFiles) → DocData → DocView
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Internet connection (for GitHub sync only)

> **No XAMPP. No PHP. No git binary required.**

### Installation

```bash
cd Gemma-Doc-Pro
npm install
npm run dev
```

App opens at: **http://localhost:5173**

### Build for Production

```bash
npm run build
# Output in /dist — deployable to Vercel, Netlify, or any static host
```

---

## Usage Guide

### Option 1: GitHub Repository Sync

1. Click **Get Started Now** on the landing page
2. In the "Sync from Cloud" input, paste any public GitHub URL:
   - `github.com/expressjs/express`
   - `https://github.com/laravel/laravel`
   - `https://github.com/django/django`
3. Click **Sync →**
4. Watch real-time progress as files are fetched from GitHub API
5. The full audit report opens automatically

**Limits:**
- Public repositories only (private repos require a GitHub Personal Access Token — not yet implemented)
- GitHub API rate limit: 60 requests/hour unauthenticated. For large repos, wait or add a PAT.
- Files capped at 300 per analysis to stay within rate limits

### Option 2: Local Project Upload

1. Click the **"Drop folder or click to browse"** dropzone
2. Select your project's root folder
3. Watch real-time progress as files are scanned locally

**Supported file types:** `.js`, `.jsx`, `.ts`, `.tsx`, `.php`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.kt`, `.cs`, `.html`, `.htm`, `.css`, `.scss`, `.json`, `.md`, `.yml`, `.yaml`, `.sql`, `.toml`, `.swift`, `.c`, `.cpp`, `.h`

**Ignored directories:** `node_modules`, `vendor`, `.git`, `dist`, `build`, `.next`, `coverage`, `__pycache__`, `.venv`

---

## Analysis Capabilities

### Framework Detection

| Language | Detected From | Examples |
|---|---|---|
| JS / TS | `package.json` dependencies | Next.js, Nuxt, Angular, Vue, Svelte, React, Vite, Express, Fastify, NestJS, Koa |
| PHP | `composer.json` + `artisan` file | Laravel, Symfony, WordPress |
| Python | `requirements.txt` / `pyproject.toml` | Django, Flask, FastAPI |

### Framework Labels in Audit Intelligence

| Language | Label Shown |
|---|---|
| JS (with Express) | `Express` |
| JS (no package.json) | `JavaScript` |
| TS (with Next.js) | `Next.js` |
| PHP (with Laravel) | `Laravel` |
| PHP (plain) | `PHP` |
| Python (with Django) | `Django` |
| CSS / SCSS | `Stylesheet` |
| HTML | `HTML5 Markup` |
| JSON | `Config / Data` |
| YAML | `Config / IaC` |
| SQL | `Database` |
| Markdown | `Documentation` |
| Ruby | `Ruby` |
| Go | `Go` |
| Rust | `Rust` |

### Security Rules (OWASP-aligned)

| Rule | Severity | Pattern |
|---|---|---|
| `js_eval` | 🔴 High | `eval()` usage |
| `js_new_function` | 🔴 High | `new Function()` |
| `js_innerhtml` | 🟡 Medium | `.innerHTML =` |
| `react_dangerous_html` | 🟡 Medium | `dangerouslySetInnerHTML` |
| `php_mysql_query` | 🔴 High | `mysql_query()` deprecated API |
| `php_eval` | 🔴 High | PHP `eval()` |
| `py_eval` / `py_exec` | 🔴 High | Python `eval()` / `exec()` |
| `secret_*` | 🔴 High | Private keys, GitHub PATs, AWS keys |
| `secret_generic_assignment` | 🟡 Medium | Hardcoded `password =`, `api_key =` |

### API Endpoint Detection

| Framework | Pattern |
|---|---|
| Express | `app.get('/x')`, `router.post('/x')`, chained `router.route()` |
| Fastify | `fastify.route({ method, url })` |
| Next.js Pages Router | `pages/api/**` + `req.method` parsing |
| Next.js App Router | `app/api/**/route.ts` + exported handlers |
| Laravel | `Route::get()`, `Route::apiResource()` |
| FastAPI | `@app.get('/x')` decorators |
| Flask | `@app.route('/x', methods=[...])` |

---

## QA Test Report

**Test Date:** 2026-05-18 | **Environment:** macOS, Vite dev server, Chrome

### Final Test Summary

| Test Phase | Tests Run | Passed | Failed |
|---|---|---|---|
| Bug Verification | 5 | 5 | 0 |
| Regression Testing | 4 | 4 | 0 |
| Functional Testing | 5 | 5 | 0 |
| Performance Testing | 4 | 4 | 0 |
| Console Error Testing | 3 | 3 | 0 |
| Security Testing | 3 | 3 | 0 |
| **TOTAL** | **24** | **24** | **0** |

### Key Verified Results

| Test | Result |
|---|---|
| Landing page loads without scroll | ✅ PASS |
| GitHub sync via REST API (expressjs/express) | ✅ PASS — 59 files, 5,493 LOC, 50 routes |
| "VANILLA" label in Audit Intelligence | ✅ FIXED — Shows real labels |
| "Try Again" resets state without page reload | ✅ PASS |
| Mermaid SVG cached on tab switch | ✅ PASS — Instant on return visit |
| Chat send button labeled "Send ↑" | ✅ PASS |
| `javascript:alert(1)` XSS attempt | ✅ PASS — Blocked, shows error |
| `<script>` tag in URL | ✅ PASS — Sanitized |
| LocalStorage sensitive data check | ✅ PASS — Nothing stored |
| Console errors on load | ✅ PASS — Zero errors |
| Header overflow on small screens | ✅ PASS — clamp() applied |

---

## Bug Fix History

### Session 1 Fixes (2026-05-18)

| Bug | Severity | Status | Fix |
|---|---|---|---|
| **BUG-001** "Try Again" permanently stuck on error screen | 🔴 High | ✅ Fixed | Added `onRetry` prop; calls parent `setAnalysisError(null)` |
| **BUG-002** GitHub Sync non-functional (XAMPP write error) | 🔴 Critical | ✅ Fixed | Replaced PHP backend with direct GitHub REST API in `App.tsx` |
| **BUG-003** Chat send button labeled "Gemma Chat" | 🟡 Low | ✅ Fixed | Changed to `"Send ↑"` |
| **BUG-004** Dashboard header overflow on small screens | 🟡 Low | ✅ Fixed | `marginBottom: clamp(1.5rem, 4vh, 5rem)` |
| **BUG-005** Mermaid SVG re-renders on every tab switch | 🟡 Low | ✅ Fixed | Added `useRef<Map<string, string>>` SVG cache |
| **VANILLA Bug** All languages showing "Vanilla" framework | 🔴 High | ✅ Fixed | Rewrote `frameworkForLang()` with semantic labels per language |

---

## Security

- All analysis runs client-side in the browser — **zero data exfiltration**
- GitHub API is called directly from the browser — only public repo metadata and file contents are fetched
- No authentication tokens or API keys are stored anywhere
- `dangerouslySetInnerHTML` is used only for trusted Mermaid SVG output (`securityLevel: 'loose'` is intentional for diagram rendering)
- XSS injection via URL input (`javascript:`, `<script>`) is blocked at the URL validation layer before any fetch is made
- LocalStorage and SessionStorage are not used

---

## Known Limitations

| Limitation | Workaround |
|---|---|
| GitHub public repos only | Add GitHub PAT to fetch headers for private repo support (planned) |
| GitHub API rate limit: 60 req/hour unauthenticated | Wait ~1 hour or implement PAT input field |
| File cap: 300 files per GitHub sync | Use local folder upload for large codebases |
| `api/analyze_repo.php` (legacy PHP backend) not functional on standard XAMPP | Not needed — GitHub sync is now browser-native |

---

## License

This project is developed for academic/competition purposes.  
© 2026 Sayista Yazdani — All rights reserved.
