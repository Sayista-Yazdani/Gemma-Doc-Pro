import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Download, Code2, Zap, Shield, Globe, Copy, Check, FileText, Network } from 'lucide-react';
import mermaid from 'mermaid';
import type { DocData } from '../lib/analyzer';
import { generateHTMLReport } from '../lib/export/htmlExport';

interface DocViewProps {
  docData: DocData;
  onBack: () => void;
}

// ── i18n dictionary ──────────────────────────────────────────────────────────
const t = {
  en: {
    totalFiles: 'Total Files', analyzed: 'Analyzed', loc: 'Lines of Code',
    newProject: 'New Project', download: 'Download JSON', exportHtml: 'Export HTML',
    copy: 'Copy JSON', copied: 'Copied!',
    summary: 'Summary', dependency: 'Arch Map', api: 'API', risk: 'Risk',
    security: 'Security', suggestions: 'Roadmap', chat: 'Chat',
    auditIntelligence: 'Audit Intelligence', health: 'Health', grade: 'Grade',
    files: 'files', sec: 'Sec', openGemmaChat: 'Open Gemma Chat',
    gemmaAiAssistant: 'Gemma AI Assistant', askGemmaPlaceholder: 'Ask Gemma about this project...',
    send: 'Send', noApiRoutes: 'No API Routes Detected', noFindings: 'No Findings Detected',
    noOptimizations: 'No Optimization Items Generated',
    mappingEngineResetting: 'Mapping engine resetting...', generatingNeuralMap: 'Generating Neural Map...',
    visualArchitecture: 'Visual Architecture', view3dMap: 'View 3D Map',
  },
  hi: {
    totalFiles: 'कुल फ़ाइलें', analyzed: 'विश्लेषण किया', loc: 'कोड की लाइनें',
    newProject: 'नया प्रोजेक्ट', download: 'JSON डाउनलोड', exportHtml: 'HTML एक्सपोर्ट',
    copy: 'JSON कॉपी', copied: 'कॉपी हो गया!',
    summary: 'सारांश', dependency: 'आर्क मैप', api: 'एपीआई', risk: 'जोखिम',
    security: 'सुरक्षा', suggestions: 'रोडमैप', chat: 'चैट',
    auditIntelligence: 'ऑडिट इंटेलिजेंस', health: 'स्वास्थ्य', grade: 'ग्रेड',
    files: 'फ़ाइलें', sec: 'सुरक्षा', openGemmaChat: 'जेम्मा चैट खोलें',
    gemmaAiAssistant: 'जेम्मा एआई सहायक', askGemmaPlaceholder: 'जेम्मा से पूछें...',
    send: 'भेजें', noApiRoutes: 'कोई एपीआई रूट नहीं', noFindings: 'कोई संकेत नहीं',
    noOptimizations: 'कोई अनुकूलन नहीं',
    mappingEngineResetting: 'मानचित्रण इंजन रीसेट हो रहा है...', generatingNeuralMap: 'न्यूरल मैप तैयार...',
    visualArchitecture: 'दृश्य वास्तुकला', view3dMap: '3D मानचित्र',
  },
} as const;

type Lang = keyof typeof t;
type TabKey = 'summary' | 'dependency' | 'api' | 'risk' | 'security' | 'suggestions' | 'chat';

const TABS: TabKey[] = ['summary', 'dependency', 'api', 'risk', 'security', 'suggestions', 'chat'];

// ── Lightweight markdown: bold and inline code only ──────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'white', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{ fontFamily: 'monospace', color: '#93c5fd', fontSize: '0.85em', background: 'rgba(59,130,246,0.1)', padding: '0.1em 0.4em', borderRadius: '4px' }}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

// ── Method color helper ──────────────────────────────────────────────────────
function methodClass(method: string): string {
  const map: Record<string, string> = { GET: 'tag-get', POST: 'tag-post', PUT: 'tag-put', DELETE: 'tag-delete', PATCH: 'tag-patch' };
  return map[method?.toUpperCase()] ?? 'tag-get';
}

// ── DocView ──────────────────────────────────────────────────────────────────
export const DocView: React.FC<DocViewProps> = ({ docData, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [isExporting, setIsExporting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [selectedDiff, setSelectedDiff] = useState<{ original: string; optimized: string } | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: `Hello! I've analyzed **${docData.projectName}**. I'm ready to provide architectural insights. How can I help?`,
    ts: Date.now(),
  }]);
  const [input, setInput] = useState('');
  const [svgCode, setSvgCode] = useState('');
  const svgCacheRef = useRef<Map<string, string>>(new Map());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const endpoints     = docData.api?.endpoints || [];
  const riskFindings  = docData.risk?.findings || [];
  const secFindings   = docData.security?.findings || [];
  const optimizations = docData.optimizations || [];
  const highFindings  = [...riskFindings, ...secFindings].filter((f) => f.severity === 'high');
  const depEdges      = (docData.dependencyGraph || '').split('\n').filter((l) => l.includes('-->')).length;
  const dynamicScore  = Math.round(docData.health?.score ?? 0);
  const dynamicGrade  = docData.health?.grade ?? (dynamicScore >= 93 ? 'A+' : dynamicScore >= 88 ? 'A' : dynamicScore >= 80 ? 'B' : dynamicScore >= 70 ? 'C' : 'D');

  // ── Mermaid init — premium dark theme with custom color tokens ──
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        background:          '#0f172a',
        primaryColor:        '#1e293b',
        primaryTextColor:    '#e2e8f0',
        primaryBorderColor:  '#334155',
        secondaryColor:      '#0f172a',
        tertiaryColor:       '#1e293b',
        lineColor:           '#3b82f6',
        edgeLabelBackground: '#1e293b',
        clusterBkg:          '#0f172a',
        clusterBorder:       '#334155',
        titleColor:          '#f8fafc',
        nodeBorder:          '#3b82f6',
        mainBkg:             '#1e293b',
        fontSize:            '14px',
        fontFamily:          'Inter, sans-serif',
      },
      securityLevel: 'loose',
      fontFamily: 'Inter, sans-serif',
      fontSize: 14,
      flowchart: { useMaxWidth: true, htmlLabels: false, curve: 'basis', diagramPadding: 16 },
    });
  }, []);

  // ── Mermaid render ──
  useEffect(() => {
    if (activeTab !== 'dependency' || !docData.dependencyGraph) return;
    const cached = svgCacheRef.current.get(docData.dependencyGraph);
    if (cached) { setSvgCode(cached); return; }
    const render = async () => {
      try {
        const id = 'mermaid-svg-' + Math.random().toString(36).substr(2, 5);
        const { svg } = await mermaid.render(id, docData.dependencyGraph);
        svgCacheRef.current.set(docData.dependencyGraph, svg);
        setSvgCode(svg);
      } catch {
        setSvgCode(`<div style="color:#f43f5e;font-weight:bold;padding:2rem;">${t[lang].mappingEngineResetting}</div>`);
      }
    };
    render();
  }, [activeTab, docData.dependencyGraph, lang]);

  // ── Chat scroll ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Chat send ──
  const handleSend = useCallback(() => {
    if (!input.trim() || isTyping) return;
    const userMsg: ChatMessage = { role: 'user', content: input, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input.toLowerCase();
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      let botResponse = '';
      const isHi = lang === 'hi';

      if (currentInput.includes('yes') || currentInput.includes('guide') || currentInput.includes('refactor') || currentInput.includes('हाँ') || currentInput.includes('सुधार')) {
        botResponse = isHi
          ? `बिल्कुल। **${riskFindings[0]?.files?.[0] || 'मुख्य मॉड्यूल'}** में SQL Injection को रोकने के लिए parameterized queries लागू करें।`
          : `Absolutely. In **${riskFindings[0]?.files?.[0] || 'the core module'}**, implement \`parameterized queries\` to prevent SQL Injection, as flagged in the Audit Roadmap.`;
      } else if (currentInput.includes('architecture') || currentInput.includes('stack') || currentInput.includes('framework') || currentInput.includes('संरचना')) {
        botResponse = isHi
          ? `यह प्रोजेक्ट **${docData.techStack?.[0]?.framework || 'एक आधुनिक संरचना'}** का उपयोग करता है। Neural Map ने **${depEdges}** logical edges detect किए।`
          : `This project uses **${docData.techStack?.[0]?.framework || 'a modern architecture'}**. The Neural Map detected **${depEdges}** core logical edges.`;
      } else if (currentInput.includes('security') || currentInput.includes('risk') || currentInput.includes('vulnerability') || currentInput.includes('सुरक्षा')) {
        botResponse = isHi
          ? `मुझे **${highFindings.length} उच्च-गंभीरता** के मुद्दे मिले। सबसे महत्वपूर्ण: \"${highFindings[0]?.title || 'कोई नहीं'}\".`
          : `Found **${highFindings.length} high-severity issues**. Most critical: \`${highFindings[0]?.title || 'None'}\`. Check the Security tab for full details.`;
      } else {
        botResponse = isHi
          ? `**${docData.projectName}** विश्लेषण के आधार पर, ${riskFindings[0]?.files?.[0] || 'core directory'} में सुरक्षा सुदृढ़ीकरण की सलाह है।`
          : `Based on **${docData.projectName}**, I recommend focusing on \`${riskFindings[0]?.files?.[0] || 'the core directory'}\` for security hardening. Want a detailed guide?`;
      }

      setIsTyping(false);
      setMessages((prev) => [...prev, { role: 'assistant', content: botResponse, ts: Date.now() }]);
    }, 1200 + Math.random() * 400);
  }, [input, isTyping, lang, riskFindings, highFindings, depEdges, docData]);

  // ── Download JSON ──
  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const blob = new Blob([JSON.stringify(docData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docData.projectName}-gemma-doc-pro.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  // ── Export HTML ──
  const handleExportHTML = () => {
    const html = generateHTMLReport(docData);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docData.projectName}-report.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Copy JSON ──
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(docData, null, 2));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const tr = t[lang];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '3rem',
        padding: 'clamp(1.5rem, 3vw, 2.5rem) clamp(1.5rem, 4vw, 3.5rem)',
        width: '100%',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Overlay: diff viewer only ── */}
      <AnimatePresence>
        {selectedDiff && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', padding: '2rem' }}>
            <div style={{ width: '100%', maxWidth: '1100px', maxHeight: '85vh', background: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2.5rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Code2 size={18} color="#3b82f6" /> Gemma Code Refactor
                </h3>
                <button onClick={() => setSelectedDiff(null)} className="btn-secondary" style={{ padding: '0.4rem 0.9rem' }}>Close</button>
              </div>
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ flex: 1, padding: '2rem', overflow: 'auto', background: 'rgba(244, 63, 94, 0.03)', borderRight: '1px solid rgba(255,255,255,0.05)' }} className="scroll-thin">
                  <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.2em', display: 'block', marginBottom: '1rem' }}>Original</span>
                  <pre style={{ fontSize: '0.85rem', color: '#fda4af', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{selectedDiff.original}</pre>
                </div>
                <div style={{ flex: 1, padding: '2rem', overflow: 'auto', background: 'rgba(16, 185, 129, 0.03)' }} className="scroll-thin">
                  <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.2em', display: 'block', marginBottom: '1rem' }}>Optimized</span>
                  <pre style={{ fontSize: '0.85rem', color: '#6ee7b7', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{selectedDiff.optimized}</pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 900, letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #60a5fa 0%, #c084fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.6rem' }}>
            {docData.projectName}
          </h2>
          <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', flexWrap: 'wrap' }}>
            <span>{tr.totalFiles}: <span style={{ color: 'white' }}>{docData.stats?.total}</span></span>
            <span>{tr.loc}: <span style={{ color: '#3b82f6' }}>{docData.stats?.totalLOC?.toLocaleString() || '0'}</span></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="btn-secondary">
            {lang === 'en' ? 'हिन्दी' : 'English'}
          </button>
          <button onClick={handleCopy} className="btn-secondary">
            {isCopied ? <Check size={14} /> : <Copy size={14} />}
            {isCopied ? tr.copied : tr.copy}
          </button>
          <button onClick={handleExportHTML} className="btn-secondary">
            <FileText size={14} /> {tr.exportHtml}
          </button>
          <button onClick={handleDownload} disabled={isExporting} style={{ padding: '0.65rem 1.25rem', background: '#3b82f6', border: 'none', borderRadius: '1rem', color: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
            <Download size={14} /> {isExporting ? 'Exporting...' : tr.download}
          </button>
          <button onClick={onBack} className="btn-secondary">{tr.newProject}</button>
        </div>
      </div>

      {/* ── Main content: left + right ── */}
      <div className="docview-grid" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* Left column — overflow:hidden so tabs stay fixed at the top */}
        <div
          style={{
            minWidth: 0,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >

          {/* Pill tab nav — never shrinks */}
          <div className="tab-pill-nav" style={{ marginBottom: '1.25rem', flexShrink: 0 }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`tab-pill${activeTab === tab ? ' active' : ''}`}
              >
                {tr[tab]}
              </button>
            ))}
          </div>

          {/* Tab panels wrapper — flex:1 and scrolls internally when activeTab is not chat */}
          <div
            className="scroll-thin"
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflowY: activeTab === 'chat' ? 'hidden' : 'auto',
              paddingRight: '0.5rem',
            }}
          >
          <AnimatePresence mode="wait">

            {/* Summary */}
            {activeTab === 'summary' && (
              <motion.div key="summary" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.07), rgba(147, 51, 234, 0.07))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2.5rem', padding: 'clamp(2rem, 4vw, 4rem)' }}>
                  <h3 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '1rem' }}>{tr.summary}</h3>
                  <p style={{ fontSize: '1rem', color: '#cbd5e1', lineHeight: 1.85, fontWeight: 500 }}>{docData.summary}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem' }}>
                  {[
                    { title: 'API Surface',  content: `${endpoints.length} routes detected`,        icon: Zap,     color: '#3b82f6' },
                    { title: 'Risk Signals', content: `${highFindings.length} high-severity`,        icon: Shield,  color: '#f43f5e' },
                    { title: 'Arch Edges',   content: `${depEdges} logic nodes`,                    icon: Network, color: '#8b5cf6' },
                    { title: 'Audit Scope',  content: `${docData.stats.analyzed} files scanned`,   icon: Globe,   color: '#10b981' },
                  ].map((card, i) => (
                    <div key={i} className="stat-card">
                      <div style={{ padding: '0.85rem', background: `${card.color}12`, borderRadius: '1rem', flexShrink: 0 }}>
                        <card.icon size={20} color={card.color} />
                      </div>
                      <div>
                        <h5 style={{ fontWeight: 700, marginBottom: '0.2rem', color: 'white', fontSize: '0.95rem' }}>{card.title}</h5>
                        <p style={{ color: '#64748b', fontSize: '0.8rem' }}>{card.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Dependency map — Mermaid dark-themed diagram, no fake 3D */}
            {activeTab === 'dependency' && (
              <motion.div key="dependency" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-blue">{tr.visualArchitecture}</span>
                  <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600 }}>
                    {depEdges} logical edge{depEdges !== 1 ? 's' : ''} detected
                  </span>
                </div>
                <div
                  dangerouslySetInnerHTML={{ __html: svgCode || `<div style="padding:4rem;text-align:center;color:#64748b;font-weight:800;font-size:0.85rem;letter-spacing:0.1em;">${tr.generatingNeuralMap.toUpperCase()}</div>` }}
                  style={{
                    background: '#0f172a',
                    border: '1px solid rgba(59,130,246,0.12)',
                    borderRadius: '2rem',
                    padding: '2.5rem',
                    display: 'flex',
                    justifyContent: 'center',
                    minHeight: '420px',
                    overflowX: 'auto',
                  }}
                />
              </motion.div>
            )}

            {/* API routes */}
            {activeTab === 'api' && (
              <motion.div key="api" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {endpoints.length === 0 ? (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '2rem', padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: 800, letterSpacing: '0.08em', fontSize: '0.8rem' }}>
                    {tr.noApiRoutes.toUpperCase()}
                  </div>
                ) : endpoints.map((api, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1.25rem', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                      <span className={`tag-method ${methodClass(api.method)}`}>{api.method}</span>
                      <code style={{ fontSize: '0.875rem', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{api.path}</code>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>{api.framework}</div>
                      <div style={{ fontSize: '0.65rem', color: '#475569' }}>{api.sourceFile}</div>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Risk + Security (shared layout) */}
            {(['risk', 'security'] as TabKey[]).includes(activeTab) && (
              <motion.div key={activeTab} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(activeTab === 'risk' ? riskFindings : secFindings).length === 0 ? (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '2rem', padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: 800, letterSpacing: '0.08em', fontSize: '0.8rem' }}>
                    {tr.noFindings.toUpperCase()}
                  </div>
                ) : (activeTab === 'risk' ? riskFindings : secFindings).map((f, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1.5rem', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h5 style={{ fontWeight: 700, color: 'white', marginBottom: '0.4rem', fontSize: '0.95rem' }}>{f.title}</h5>
                      <p style={{ fontSize: '0.83rem', color: '#64748b', lineHeight: 1.65 }}>{f.description}</p>
                      {f.files && f.files.length > 0 && (
                        <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {f.files.map((file, fi) => (
                            <span key={fi} className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem' }}>{file}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className={`badge ${f.severity === 'high' ? 'badge-red' : 'badge-amber'}`} style={{ flexShrink: 0 }}>
                      {f.severity}
                    </span>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Optimization roadmap */}
            {activeTab === 'suggestions' && (
              <motion.div key="suggestions" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {optimizations.length === 0 ? (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '2rem', padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: 800, letterSpacing: '0.08em', fontSize: '0.8rem' }}>
                    {tr.noOptimizations.toUpperCase()}
                  </div>
                ) : optimizations.map((opt, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1.5rem', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h5 style={{ fontWeight: 700, color: 'white', marginBottom: '0.35rem', fontSize: '0.95rem' }}>{opt.title}</h5>
                      <p style={{ color: '#64748b', fontSize: '0.83rem', lineHeight: 1.65 }}>{opt.rationale}</p>
                    </div>
                    <button
                      disabled={!opt.example}
                      onClick={() => opt.example && setSelectedDiff({ original: opt.example.original, optimized: opt.example.optimized })}
                      className="btn-secondary"
                      style={{ flexShrink: 0, opacity: opt.example ? 1 : 0.4, cursor: opt.example ? 'pointer' : 'not-allowed', color: opt.example ? '#60a5fa' : undefined }}
                    >
                      Refactor
                    </button>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Chat — fills remaining column height, input always visible */}
            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(15, 23, 42, 0.4)',
                  borderRadius: '2.5rem',
                  border: '1px solid rgba(255,255,255,0.05)',
                  overflow: 'hidden',
                }}
              >
                {/* Chat header */}
                <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <div className="dot-live" />
                  <MessageSquare size={16} color="#94a3b8" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>{tr.gemmaAiAssistant}</span>
                </div>

                {/* Messages */}
                <div className="scroll-thin" style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: '0.75rem', alignItems: 'flex-end' }}>
                      <div style={{
                        background: m.role === 'user' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${m.role === 'user' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        padding: '0.9rem 1.25rem',
                        borderRadius: m.role === 'user' ? '1.25rem 1.25rem 0.25rem 1.25rem' : '1.25rem 1.25rem 1.25rem 0.25rem',
                        color: '#cbd5e1',
                        fontSize: '0.875rem',
                        lineHeight: 1.65,
                        maxWidth: '80%',
                      }}>
                        {renderMarkdown(m.content)}
                        <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.5rem', textAlign: m.role === 'user' ? 'right' : 'left' }}>
                          {formatTime(m.ts)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {isTyping && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '1.25rem 1.25rem 1.25rem 0.25rem', width: 'fit-content' }}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={tr.askGemmaPlaceholder}
                    disabled={isTyping}
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '1rem',
                      padding: '0.85rem 1.25rem',
                      color: 'white',
                      fontSize: '0.875rem',
                      outline: 'none',
                      opacity: isTyping ? 0.6 : 1,
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isTyping || !input.trim()}
                    style={{
                      padding: '0 1.25rem',
                      borderRadius: '1rem',
                      background: input.trim() && !isTyping ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                      color: 'white',
                      border: 'none',
                      cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    {tr.send} ↑
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>{/* end tab-panels wrapper */}
        </div>

        {/* Right sidebar */}
        <div className="scroll-thin" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto', height: '100%' }}>

          {/* Health gauge */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '2.5rem 2rem', borderRadius: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                <circle
                  cx="80" cy="80" r="68"
                  fill="none" stroke="#3b82f6" strokeWidth="10"
                  strokeDasharray="427"
                  strokeDashoffset={427 - (427 * dynamicScore) / 100}
                  strokeLinecap="round"
                  transform="rotate(-90 80 80)"
                  className="health-stroke"
                  style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)' }}
                />
              </svg>
              <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{dynamicScore}</div>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.1em', marginTop: '0.25rem' }}>{tr.health.toUpperCase()}</div>
              </div>
            </div>
            <div className="badge badge-green">{tr.grade.toUpperCase()}: {dynamicGrade}</div>
          </div>

          {/* Tech stack */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '2rem', borderRadius: '2.5rem' }}>
            <h4 style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.75rem' }}>
              {tr.auditIntelligence}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {docData.techStack?.map((tech, i) => {
                const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];
                const color  = colors[i % colors.length];
                const pct    = Math.round((tech.loc / (docData.stats?.totalLOC || 1)) * 100);
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>{tech.lang}</span>
                        <span className="badge badge-blue" style={{ fontSize: '0.55rem', padding: '0.12rem 0.45rem' }}>{tech.framework}</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b', fontWeight: 600, paddingLeft: '1.25rem' }}>
                      <span>{tech.count} {tr.files}</span>
                      <span>{tr.sec}: <span style={{ color: tech.security > 90 ? '#10b981' : '#f59e0b' }}>{tech.security}/100</span></span>
                    </div>
                    <div style={{ height: '5px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden', marginLeft: '1.25rem' }}>
                      <div style={{ height: '100%', background: `linear-gradient(90deg, ${color}, transparent)`, width: `${pct}%`, borderRadius: '3px', transition: 'width 1s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Open chat CTA */}
          <button
            onClick={() => setActiveTab('chat')}
            style={{
              width: '100%', padding: '1.25rem',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.18)',
              borderRadius: '2rem',
              color: 'white', fontWeight: 800, fontSize: '0.72rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = 'rgba(59,130,246,0.15)'; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = 'rgba(59,130,246,0.08)'; }}
          >
            <MessageSquare size={16} /> {tr.openGemmaChat.toUpperCase()}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default DocView;
