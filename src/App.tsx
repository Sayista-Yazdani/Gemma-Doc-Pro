import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LandingView } from './views/LandingView';
import { DashboardView } from './views/DashboardView';
import { DocView } from './views/DocView';
import { analyzeUploadedProject, type DocData } from './lib/analyzer';
import { getCloudProvider } from './lib/cloud';
import { saveScan } from './lib/cache/scanHistory';

function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [docData, setDocData] = useState<DocData | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Lock body scroll only on the landing page; unlock for dashboard + docview
  useEffect(() => {
    const isLanding = !isStarted;
    document.body.classList.toggle('landing-page', isLanding);
    return () => document.body.classList.remove('landing-page');
  }, [isStarted]);
  const handleRepoAnalyze = async (repoUrl: string, token?: string) => {
    if (!repoUrl.trim()) return;

    setAnalysisError(null);
    setIsProcessing(true);

    try {
      const { provider, isGitHub, repoName, projectPath } = getCloudProvider(repoUrl, token);

      setProgressLabel(`Connecting to ${isGitHub ? 'GitHub' : 'GitLab'}: ${projectPath}...`);
      const allNodes = await provider.fetchTree();

      const IGNORE_DIRS = new Set([
        'node_modules', '.git', 'dist', 'build', 'out', 'vendor',
        '__pycache__', '.next', '.nuxt', '.cache', 'coverage',
      ]);
      const CODE_EXTS = new Set([
        'js','jsx','mjs','cjs','ts','tsx','mts','cts',
        'php','py','rb','go','rs','java','kt','cs','swift',
        'html','htm','css','scss','json','md','yml','yaml','toml','sql',
        'c','cpp','h','hpp',
      ]);

      const capLimit = token ? 800 : 300;
      const relevant = allNodes.filter((f) => {
        if (f.type !== 'blob') return false;
        const parts = f.path.split('/');
        if (parts.some((p) => IGNORE_DIRS.has(p))) return false;
        const ext = (f.path.split('.').pop() || '').toLowerCase();
        return CODE_EXTS.has(ext) && (f.size ?? 0) < 500_000;
      }).slice(0, capLimit);

      if (relevant.length === 0) throw new Error('No analyzable source files found in this repository.');
      setProgressLabel(`Fetching ${relevant.length} files from ${repoName}...`);

      const syntheticFiles = await provider.fetchFiles(relevant, (done, total) => {
        setProgressLabel(`Fetched ${done}/${total} files...`);
      });

      if (syntheticFiles.length === 0) throw new Error('Could not download any files from this repository.');

      setProgressLabel(`Analyzing ${syntheticFiles.length} files...`);
      const result = await analyzeUploadedProject(syntheticFiles, {
        onProgress: (done, total, currentPath) => {
          setProgressLabel(`Auditing ${done}/${total}: ${currentPath?.split('/').pop() || ''}`);
        },
      });

      saveScan(result.projectName, result);
      setDocData(result);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error during repo sync.';
      setAnalysisError(msg);
    } finally {
      setIsProcessing(false);
      setProgressLabel('');
    }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setAnalysisError(null);
    setIsProcessing(true);
    setProgressLabel(`Scanning ${files.length} files...`);

    try {
      const result = await analyzeUploadedProject(files, {
        onProgress: (done, total, currentPath) => {
          setProgressLabel(`Auditing ${done}/${total}: ${currentPath?.split('/').pop() || ''}`);
        }
      });
      saveScan(result.projectName, result);
      setDocData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error during local analysis.';
      setAnalysisError(msg);
    } finally {
      setIsProcessing(false);
      setProgressLabel('');
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isStarted ? '1.5rem' : '0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        minHeight: 0,
      }}
    >
      <AnimatePresence mode="wait">
        {!isStarted ? (
          <LandingView onStart={() => setIsStarted(true)} />
        ) : docData ? (
          <DocView docData={docData} onBack={() => { setDocData(null); setAnalysisError(null); }} />
        ) : (
          <DashboardView
            isProcessing={isProcessing}
            progressLabel={progressLabel}
            analysisError={analysisError}
            onFolderSelect={handleFolderSelect}
            onRepoAnalyze={handleRepoAnalyze}
            onRetry={() => setAnalysisError(null)}
            onBack={() => setIsStarted(false)}
            onLoadHistory={(report) => setDocData(report)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
