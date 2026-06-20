import type { DocData } from '../analyzer';

export function generateHTMLReport(docData: DocData): string {
  const { projectName, summary, stats, techStack, api, risk, security, health } = docData;

  const endpoints = api?.endpoints || [];
  const riskFindings = risk?.findings || [];
  const securityFindings = security?.findings || [];
  const allFindings = [...riskFindings, ...securityFindings];
  const score = Math.round(health?.score ?? 0);
  const grade = health?.grade ?? (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D');
  const generated = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

  const severityColor = (s: string) =>
    s === 'high' ? '#f43f5e' : s === 'medium' ? '#f59e0b' : '#22c55e';

  const methodColor = (m: string) => {
    const map: Record<string, string> = {
      GET: '#60a5fa', POST: '#c084fc', PUT: '#fbbf24',
      DELETE: '#f43f5e', PATCH: '#34d399',
    };
    return map[m.toUpperCase()] ?? '#94a3b8';
  };

  const endpointRows = endpoints.map(e => `
    <tr>
      <td><span style="color:${methodColor(e.method)};font-weight:700;font-size:11px;">${e.method}</span></td>
      <td><code>${e.path}</code></td>
      <td>${e.framework ?? '—'}</td>
      <td style="color:#64748b;font-size:12px;">${e.sourceFile ?? '—'}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="color:#64748b;text-align:center;">No API routes detected</td></tr>';

  const findingRows = allFindings.map(f => `
    <tr>
      <td style="font-weight:600;">${f.title}</td>
      <td style="color:#94a3b8;font-size:13px;">${f.description}</td>
      <td style="color:${severityColor(f.severity)};font-weight:700;font-size:11px;text-transform:uppercase;">${f.severity}</td>
    </tr>`).join('') || '<tr><td colspan="3" style="color:#64748b;text-align:center;">No findings detected</td></tr>';

  const techRows = (techStack ?? []).map(t => `
    <tr>
      <td style="font-weight:600;">${t.lang}</td>
      <td>${t.framework}</td>
      <td>${t.count} files</td>
      <td>${t.loc.toLocaleString()} LOC</td>
      <td style="color:${t.security > 90 ? '#22c55e' : '#f59e0b'};font-weight:700;">${t.security}/100</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName} — Gemma Doc Pro Report</title>
  <style>
    :root { --accent: #3b82f6; --bg: #020617; --card: #0f172a; --border: rgba(255,255,255,0.08); --text: #f8fafc; --muted: #94a3b8; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 3rem 2rem; max-width: 1100px; margin: 0 auto; line-height: 1.6; }
    h1 { font-size: 2.5rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.5rem; }
    h2 { font-size: 1.1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent); margin-bottom: 1.25rem; margin-top: 2.5rem; }
    .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 2.5rem; }
    .meta { display: flex; gap: 2rem; font-size: 0.75rem; color: var(--muted); margin-bottom: 3rem; flex-wrap: wrap; }
    .meta span b { color: white; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 1.25rem; padding: 2rem; margin-bottom: 1.5rem; }
    .score { display: inline-flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1.25rem; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); border-radius: 100px; font-size: 0.85rem; font-weight: 700; color: #60a5fa; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
    td { padding: 0.85rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.03); vertical-align: top; }
    code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem; color: #93c5fd; }
    footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
  </style>
</head>
<body>
  <h1>${projectName}</h1>
  <p class="subtitle">Gemma Doc Pro — Automated Codebase Intelligence Report</p>
  <div class="meta">
    <span>Total Files: <b>${stats?.total ?? '—'}</b></span>
    <span>Analyzed: <b>${stats?.analyzed ?? '—'}</b></span>
    <span>Lines of Code: <b>${stats?.totalLOC?.toLocaleString() ?? '—'}</b></span>
    <span>Generated: <b>${generated}</b></span>
  </div>

  <div class="score">Health Score: ${score}/100 &nbsp;·&nbsp; Grade: ${grade}</div>

  <h2>Executive Summary</h2>
  <div class="card"><p style="color:#cbd5e1;line-height:1.8;">${summary ?? 'No summary available.'}</p></div>

  <h2>Technology Stack</h2>
  <div class="card">
    <table>
      <thead><tr><th>Language</th><th>Framework</th><th>Files</th><th>LOC</th><th>Security</th></tr></thead>
      <tbody>${techRows}</tbody>
    </table>
  </div>

  <h2>API Surface (${endpoints.length} routes)</h2>
  <div class="card">
    <table>
      <thead><tr><th>Method</th><th>Path</th><th>Framework</th><th>Source File</th></tr></thead>
      <tbody>${endpointRows}</tbody>
    </table>
  </div>

  <h2>Risk &amp; Security Findings (${allFindings.length} total)</h2>
  <div class="card">
    <table>
      <thead><tr><th>Title</th><th>Description</th><th>Severity</th></tr></thead>
      <tbody>${findingRows}</tbody>
    </table>
  </div>

  <footer>
    <span>Gemma Doc Pro · AI-Powered Code Intelligence</span>
    <span>Report generated on ${generated}</span>
  </footer>
</body>
</html>`;
}
