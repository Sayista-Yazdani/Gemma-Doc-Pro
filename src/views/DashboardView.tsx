import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, Globe, ArrowRight, CheckCircle2, CloudSync, Layout, ChevronDown } from 'lucide-react';
import { RecentScansPanel } from '../components/RecentScansPanel';
import type { DocData } from '../lib/analyzer';

interface DashboardViewProps {
  onFolderSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRepoAnalyze: (repoUrl: string, token?: string) => Promise<void>;
  isProcessing: boolean;
  progressLabel?: string;
  analysisError?: string | null;
  onRetry: () => void;
  onBack: () => void;
  onLoadHistory: (report: DocData) => void;
}

const FEATURE_LIST = [
  {
    title: 'Deep File Auditing',
    content: 'Gemma 4 analyzes up to 5,000 files for security and logic patterns.',
    color: '#3b82f6',
  },
  {
    title: 'Architectural Visualization',
    content: 'Real-time dependency maps with cross-layer validation.',
    color: '#a855f7',
  },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  onFolderSelect,
  onRepoAnalyze,
  isProcessing,
  progressLabel,
  analysisError,
  onRetry,
  onBack,
  onLoadHistory,
}) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [patToken, setPatToken] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 30) {
      setShowScrollHint(false);
    } else {
      setShowScrollHint(true);
    }
  };

  const scrollToScans = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleGithubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRepoAnalyze(repoUrl, patToken.trim() || undefined);
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '1rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap', gap: '1rem',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            padding: '1rem',
            background: 'rgba(59, 130, 246, 0.1)',
            borderRadius: '1.25rem',
            border: '1px solid rgba(59, 130, 246, 0.2)',
          }}>
            <Layout size={28} color="#3b82f6" />
          </div>
          <h2 style={{
            fontSize: 'clamp(1.35rem, 3vw, 1.875rem)',
            fontWeight: 900,
            letterSpacing: '-0.025em',
            background: 'linear-gradient(135deg, #60a5fa 0%, #c084fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Gemma Doc Pro
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <span className="dot-live" />
            Cloud Engine Active
          </div>
          <button onClick={onBack} className="btn-secondary">
            ← Back
          </button>
        </div>
      </header>
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="scroll-thin"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          paddingRight: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="dashboard-grid">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
          >
            <div>
              <h1 style={{
                fontSize: 'clamp(2.35rem, 4.5vw, 4rem)',
                fontWeight: 900,
                lineHeight: 1.1,
                letterSpacing: '-0.05em',
                marginBottom: '0.75rem',
              }}>
                The Intelligent <br />
                <span style={{ color: '#3b82f6' }}>Code Analyst.</span>
              </h1>
              <p style={{ fontSize: '0.95rem', color: '#94a3b8', lineHeight: 1.6, maxWidth: '440px' }}>
                Upload local repositories or sync directly from GitHub to generate deep-reasoning documentation in seconds.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {FEATURE_LIST.map((feature) => (
                <div key={feature.title} style={{
                  padding: '1rem 1.5rem',
                  background: `${feature.color}05`,
                  border: `1px solid ${feature.color}18`,
                  borderRadius: '1.25rem',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                }}>
                  <CheckCircle2 size={18} color={feature.color} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem', color: 'white' }}>
                      {feature.title}
                    </h4>
                    <p style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.5 }}>{feature.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: input card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '2.5rem',
              padding: '1.5rem clamp(1.5rem, 3vw, 2.5rem)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
          {isProcessing ? (
            /* ── Processing state ── */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 1rem', gap: '2rem' }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: '96px', height: '96px', borderRadius: '50%',
                  border: '4px solid rgba(59, 130, 246, 0.1)',
                  borderTopColor: '#3b82f6',
                  animation: 'spin 1s linear infinite',
                }} />
                <CloudSync size={36} color="#3b82f6" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>Analyzing Codebase...</h3>
                <p style={{
                  color: '#3b82f6', fontSize: '0.78rem', fontWeight: 600,
                  fontFamily: 'monospace', maxWidth: '260px', lineHeight: 1.6,
                }}>
                  {progressLabel || 'Gemma 4 is performing a deep heuristic audit'}
                </p>
              </div>
            </div>
          ) : analysisError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', gap: '1.5rem', textAlign: 'center' }}>
              <div style={{ padding: '1.5rem', background: 'rgba(244, 63, 94, 0.08)', borderRadius: '50%', border: '1px solid rgba(244, 63, 94, 0.15)' }}>
                <span style={{ fontSize: '2.5rem' }}>⚠️</span>
              </div>
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: '0.75rem', color: '#f43f5e', fontSize: '1.1rem' }}>
                  Analysis Failed
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                  {analysisError}
                </p>
                <button
                  onClick={onRetry}
                  style={{
                    padding: '0.75rem 2rem',
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: '1rem',
                    color: 'white',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                    Option 1: Sync from Cloud
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPat(!showPat)}
                    className="btn-secondary"
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.68rem' }}
                  >
                    🔑 {showPat ? 'Hide PAT' : 'Add GitHub PAT'}
                  </button>
                </div>

                <form onSubmit={handleGithubSubmit} style={{ position: 'relative' }}>
                  <Globe size={18} color="#64748b" style={{ position: 'absolute', left: '1.25rem', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="github.com/user/repo or gitlab.com/group/repo"
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '1.5rem',
                      padding: '1.25rem 1.25rem 1.25rem 3.25rem',
                      color: 'white',
                      outline: 'none',
                      fontSize: '0.875rem',
                      transition: 'border-color 0.2s ease',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; }}
                  />
                  <button
                    type="submit"
                    style={{
                      position: 'absolute', right: '0.45rem', top: '0.45rem', bottom: '0.45rem',
                      padding: '0 1.4rem',
                      background: '#3b82f6',
                      borderRadius: '1.15rem',
                      color: 'white', border: 'none',
                      fontWeight: 700, fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}
                  >
                    Sync <ArrowRight size={15} />
                  </button>
                </form>

                {showPat && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <input
                      type="password"
                      value={patToken}
                      onChange={(e) => setPatToken(e.target.value)}
                      placeholder="GitHub Personal Access Token (optional — for private repos)"
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px dashed rgba(255, 255, 255, 0.15)',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        color: 'white', outline: 'none', fontSize: '0.8rem',
                      }}
                    />
                  </motion.div>
                )}
              </div>

              <div className="divider">OR</div>

              <div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 900, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.15em',
                  display: 'block', marginBottom: '1rem',
                }}>
                  Option 2: Local Upload
                </span>
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '2rem' }}>
                  <input
                    type="file"
                    // @ts-expect-error — non-standard directory upload supported by Chromium
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={onFolderSelect}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', zIndex: 2 }}
                  />
                  <div className="dropzone" style={{ padding: '1.75rem 1.5rem', borderRadius: '1.5rem' }}>
                    <div style={{ padding: '0.75rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '1rem', marginBottom: '0.85rem' }}>
                      <FolderOpen size={24} color="#64748b" />
                    </div>
                    <p style={{ fontWeight: 700, marginBottom: '0.2rem', fontSize: '0.85rem' }}>
                      Drop folder or click to browse
                    </p>
                    <p style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      Supports PHP, JS, TS, Python, Go, Ruby & more
                    </p>
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '0.85rem 1.15rem',
                background: 'rgba(245, 158, 11, 0.04)',
                border: '1px solid rgba(245, 158, 11, 0.12)',
                borderRadius: '1rem',
              }}>
                <Globe size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <p style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.5 }}>
                  Repositories are processed on your local machine. No code is sent to external servers.
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {!isProcessing && !analysisError && (
        <>
          {/* Scroll hint — visible only until user scrolls */}
          <div
            onClick={scrollToScans}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '1.5rem 0 0.5rem',
              opacity: showScrollHint ? 0.75 : 0,
              pointerEvents: showScrollHint ? 'auto' : 'none',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
              Recent Scans Below
            </span>
            <ChevronDown size={18} color="#3b82f6" className="bounce-y" style={{ strokeWidth: 2.8 }} />
          </div>
          <RecentScansPanel onLoadHistory={onLoadHistory} />
        </>
      )}
      </div>
    </div>
  );
};
