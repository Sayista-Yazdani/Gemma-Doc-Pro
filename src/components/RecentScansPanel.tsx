import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronRight, Trash2, FolderCode } from 'lucide-react';
import { loadScans, clearHistory, type CacheEntry } from '../lib/cache/scanHistory';
import type { DocData } from '../lib/analyzer';

interface RecentScansPanelProps {
  onLoadHistory: (report: DocData) => void;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return 'Just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function gradeColor(score: number): string {
  if (score >= 90) return '#10b981';
  if (score >= 75) return '#3b82f6';
  if (score >= 60) return '#f59e0b';
  return '#f43f5e';
}

export const RecentScansPanel: React.FC<RecentScansPanelProps> = ({ onLoadHistory }) => {
  const [scans, setScans] = useState<CacheEntry[]>(() => loadScans());
  const [confirmClear, setConfirmClear] = useState(false);

  if (scans.length === 0) return null;

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    clearHistory();
    setScans([]);
    setConfirmClear(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      style={{ marginTop: '3rem' }}
    >
      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Clock size={14} color="#64748b" />
          <span style={{
            fontSize: '0.7rem', fontWeight: 900, color: '#64748b',
            textTransform: 'uppercase', letterSpacing: '0.15em'
          }}>
            Recent Scans
          </span>
          <span className="badge badge-blue" style={{ padding: '0.15rem 0.55rem', fontSize: '0.6rem' }}>
            {scans.length}
          </span>
        </div>
        <button
          onClick={handleClear}
          className="btn-danger-outline"
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.65rem' }}
          title={confirmClear ? 'Click again to confirm' : 'Clear all history'}
        >
          <Trash2 size={11} />
          {confirmClear ? 'Confirm Clear?' : 'Clear All'}
        </button>
      </div>

      {/* Scan cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <AnimatePresence>
          {scans.map((entry, i) => {
            const score = Math.round(entry.report.health?.score ?? 0);
            const color = gradeColor(score);
            const grade = entry.report.health?.grade
              ?? (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D');

            return (
              <motion.button
                key={entry.projectName + entry.timestamp}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10, height: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => onLoadHistory(entry.report)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.025)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '1.25rem',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59, 130, 246, 0.06)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(59, 130, 246, 0.18)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(3px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.025)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255, 255, 255, 0.07)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', minWidth: 0 }}>
                  <div style={{
                    padding: '0.6rem',
                    background: 'rgba(59, 130, 246, 0.08)',
                    borderRadius: '0.75rem',
                    flexShrink: 0,
                  }}>
                    <FolderCode size={16} color="#60a5fa" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontWeight: 700, fontSize: '0.85rem', color: 'white',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '180px',
                    }}>
                      {entry.projectName}
                    </p>
                    <p style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.1rem' }}>
                      {entry.report.stats?.total ?? '?'} files · {timeAgo(entry.timestamp)}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 900, color, lineHeight: 1 }}>{grade}</div>
                    <div style={{ fontSize: '0.6rem', color: '#475569', fontWeight: 700, marginTop: '0.15rem' }}>
                      {score}/100
                    </div>
                  </div>
                  <ChevronRight size={14} color="#475569" />
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
