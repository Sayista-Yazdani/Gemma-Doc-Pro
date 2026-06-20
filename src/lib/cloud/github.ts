import type { RepoProvider, TreeNode } from './types';

export class GithubProvider implements RepoProvider {
  private owner: string;
  private repo: string;
  private token?: string;

  constructor(owner: string, repo: string, token?: string) {
    this.owner = owner;
    this.repo = repo;
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }
    return headers;
  }

  async fetchTree(): Promise<TreeNode[]> {
    const treeRes = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/HEAD?recursive=1`,
      { headers: this.getHeaders() }
    );

    if (!treeRes.ok) {
      if (treeRes.status === 404) {
        throw new Error(`Repository "${this.owner}/${this.repo}" not found or is private.`);
      }
      if (treeRes.status === 403 || treeRes.status === 429) {
        throw new Error('GitHub API rate limit exceeded. Wait a few minutes or provide an access token.');
      }
      throw new Error(`GitHub API error: HTTP ${treeRes.status}`);
    }

    const treeData = await treeRes.json();
    const tree = (treeData.tree || []) as Array<{ path: string; type: string; size?: number }>;

    return tree.map((node) => ({
      path: node.path,
      type: node.type === 'blob' ? 'blob' : 'tree',
      size: node.size,
    }));
  }

  async fetchFiles(
    nodes: TreeNode[],
    onProgress: (done: number, total: number) => void
  ): Promise<File[]> {
    const BATCH_SIZE = 8;
    const files: File[] = [];

    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (node) => {
          try {
            const res = await fetch(
              `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${node.path}`,
              { headers: this.getHeaders() }
            );
            if (!res.ok) return null;
            const data = await res.json();
            if (!data.content || data.encoding !== 'base64') return null;

            // Unicode-safe Base64 decode
            const binary = atob(data.content.replace(/\s/g, ''));
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let j = 0; j < len; j++) {
              bytes[j] = binary.charCodeAt(j);
            }
            const decoded = new TextDecoder('utf-8').decode(bytes);

            const blob = new Blob([decoded], { type: 'text/plain' });
            const filename = node.path.split('/').pop() || node.path;
            const file = new File([blob], filename, { type: 'text/plain' });

            Object.defineProperty(file, 'webkitRelativePath', {
              value: `${this.repo}/${node.path}`,
              writable: false,
              enumerable: true,
              configurable: false,
            });

            return file;
          } catch {
            return null;
          }
        })
      );

      files.push(...(results.filter(Boolean) as File[]));
      onProgress(Math.min(i + BATCH_SIZE, nodes.length), nodes.length);
    }

    return files;
  }
}
