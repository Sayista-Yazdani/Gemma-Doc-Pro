import LZString from 'lz-string';
import type { DocData } from '../analyzer';

export interface CacheEntry {
  version: number;
  projectName: string;
  timestamp: number;
  report: DocData;
}

const CACHE_KEY = 'gemma_doc_history_v1';
const SCHEMA_VERSION = 1;
const MAX_HISTORY_ITEMS = 5;

export function saveScan(projectName: string, report: DocData): void {
  try {
    const history = loadScans();
  
    const filtered = history.filter(
      (item) => item.projectName.toLowerCase() !== projectName.toLowerCase()
    );

    const newEntry: CacheEntry = {
      version: SCHEMA_VERSION,
      projectName,
      timestamp: Date.now(),
      report,
    };
    if (filtered.length >= MAX_HISTORY_ITEMS) {
      filtered.sort((a, b) => a.timestamp - b.timestamp);
      filtered.shift(); // remove oldest
    }

    filtered.push(newEntry);
    
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const serialized = JSON.stringify(filtered);
    const compressed = LZString.compressToUTF16(serialized);
    localStorage.setItem(CACHE_KEY, compressed);
  } catch (e) {
    console.error('Failed to save scan history:', e);
    
    try {
      const history = loadScans();
      if (history.length > 0) {
        history.sort((a, b) => a.timestamp - b.timestamp);
        history.shift(); // Evict oldest
        const serialized = JSON.stringify(history);
        const compressed = LZString.compressToUTF16(serialized);
        localStorage.setItem(CACHE_KEY, compressed);
      }
    } catch (innerError) {
      console.error('Failed to recover from storage limit constraints:', innerError);
    }
  }
}

export function loadScans(): CacheEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];

    const decompressed = LZString.decompressFromUTF16(raw);
    if (!decompressed) return [];

    const parsed = JSON.parse(decompressed);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: any) => {
      return (
        item &&
        item.version === SCHEMA_VERSION &&
        typeof item.projectName === 'string' &&
        typeof item.timestamp === 'number' &&
        item.report &&
        typeof item.report.projectName === 'string' &&
        item.report.stats &&
        Array.isArray(item.report.techStack)
      );
    }) as CacheEntry[];
  } catch (e) {
    console.error('Failed to load scan history:', e);
    return [];
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    console.error('Failed to clear scan history:', e);
  }
}
