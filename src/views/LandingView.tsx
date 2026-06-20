import React from 'react';
import { motion } from 'framer-motion';
import { FileCode, Shield, Zap, Layout, ArrowRight } from 'lucide-react';
import { FeatureCard, StatBadge } from '../components/UIComponents';

interface LandingViewProps {
  onStart: () => void;
}

const FEATURES = [
  {
    icon: <Shield size={20} />,
    title: 'Privacy First',
    desc: '100% local. Your code never leaves your machine.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Gemma 4 Intel',
    desc: "Google's next-gen model for deep code reasoning.",
  },
  {
    icon: <Layout size={20} />,
    title: 'Visual Context',
    desc: 'Dependency maps, security vectors, logic flow.',
  },
];

const STATS = [
  { value: '5K+',   label: 'Files / Scan' },
  { value: '10+',   label: 'Languages'    },
  { value: '100%',  label: 'Local'        },
  { value: '<1min', label: 'Analysis'     },
];

export const LandingView: React.FC<LandingViewProps> = ({ onStart }) => {
  return (
    <motion.div
      key="landing"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.93 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      /* Fill the card height; no overflow so nothing scrolls */
      style={{
        width: '100%',
        height: 'calc(100dvh - 3rem)',
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '3rem',
        boxShadow: '0 40px 100px -20px rgba(0,0,0,0.75)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        textAlign: 'center',
        /* Horizontal padding shrinks on smaller viewports */
        padding: '0 clamp(1.5rem, 6vw, 5rem)',
      }}
    >
      {/* Ambient orbs — contained within the card */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '-10%',
          width: '450px', height: '450px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.09) 0%, transparent 70%)',
          animation: 'orb-drift 18s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', right: '-5%',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(147,51,234,0.07) 0%, transparent 70%)',
          animation: 'orb-drift 24s ease-in-out infinite reverse',
        }} />
      </div>

      {/* All content above the orbs */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'contents' }}>

        {/* ── Row 1: Badge ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <span className="badge badge-purple" style={{ fontSize: '0.68rem', padding: '0.35rem 0.9rem' }}>
            ✦ AI-Powered · Privacy First · Open Source
          </span>
        </motion.div>

        {/* ── Row 2: Icon + Heading + Subtitle stacked ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.45 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}
        >
          <div
            className="icon-box"
            style={{ padding: '1rem', animation: 'glow-pulse 3s ease-in-out infinite' }}
          >
            <FileCode style={{ width: '2.5rem', height: '2.5rem', color: '#60a5fa' }} />
          </div>

          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)', marginBottom: 0 }}>
            Gemma <span className="text-gradient">Doc Pro</span>
          </h1>

          <p style={{ maxWidth: '520px', color: '#94a3b8', fontSize: 'clamp(0.85rem, 1.5vw, 1rem)', lineHeight: 1.65 }}>
            Transform your codebase into a premium developer guide using Gemma&nbsp;4.
            Visual architecture, security audits &amp; smart docs — 100% private.
          </p>
        </motion.div>

        {/* ── Row 3: Stats ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {STATS.map((s, i) => (
            <StatBadge key={s.label} value={s.value} label={s.label} delay={0.32 + i * 0.06} />
          ))}
        </motion.div>

        {/* ── Row 4: Feature cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.45 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.85rem',
            width: '100%',
          }}
        >
          {FEATURES.map((f, i) => (
            <FeatureCard
              key={f.title}
              icon={f.icon}
              title={f.title}
              desc={f.desc}
              delay={0.44 + i * 0.08}
            />
          ))}
        </motion.div>

        {/* ── Row 5: CTA button ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          style={{ position: 'relative', display: 'inline-block' }}
        >
          {/* Pulse ring */}
          <span aria-hidden="true" style={{
            position: 'absolute', inset: 0, borderRadius: '1.5rem',
            border: '2px solid rgba(59,130,246,0.5)',
            animation: 'pulse-ring 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
            pointerEvents: 'none',
          }} />
          <button onClick={onStart} className="btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1rem' }}>
            Get Started Now <ArrowRight style={{ width: '1.1rem', height: '1.1rem' }} />
          </button>
        </motion.div>

      </div>
    </motion.div>
  );
};
