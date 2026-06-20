import React from 'react';
import { motion } from 'framer-motion';

// ── FeatureCard ─────────────────────────────────────────────────────────────
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay?: number;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, desc, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="feature-item"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div style={{
        marginBottom: '1.25rem',
        padding: '0.85rem',
        background: 'rgba(59, 130, 246, 0.08)',
        width: 'fit-content',
        borderRadius: '1rem',
        border: '1px solid rgba(59, 130, 246, 0.15)',
        color: '#60a5fa',
        transition: 'box-shadow 0.3s ease, background 0.3s ease',
      }}>
        {icon}
      </div>
      <h3 style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: '1.05rem',
        fontWeight: 700,
        marginBottom: '0.6rem',
        color: 'white',
      }}>
        {title}
      </h3>
      <p style={{ color: '#94a3b8', lineHeight: 1.65, fontSize: '0.875rem' }}>{desc}</p>
    </motion.div>
  );
};

// ── StatBadge ───────────────────────────────────────────────────────────────
interface StatBadgeProps {
  value: string;
  label: string;
  delay?: number;
}

export const StatBadge: React.FC<StatBadgeProps> = ({ value, label, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.2rem',
        padding: '0.75rem 1.5rem',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: '1.25rem',
      }}
    >
      <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
    </motion.div>
  );
};

// ── SupportTag ──────────────────────────────────────────────────────────────
interface SupportTagProps {
  color: string;
  label: string;
}

export const SupportTag: React.FC<SupportTagProps> = ({ color, label }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem', fontWeight: 500 }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
        background: color, boxShadow: `0 0 8px ${color}`,
      }} />
      {label}
    </div>
  );
};
