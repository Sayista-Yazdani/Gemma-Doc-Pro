import type { RepoProvider, TreeNode } from './types';

export class GitlabProvider implements RepoProvider {
  private projectPath: string;
  private token?: string;
  private repoName: string;

  constructor(projectPath: string, token?: string) {
    this.projectPath = encodeURIComponent(projectPath);
    this.token = token;
    const parts = projectPath.split('/');
    this.repoName = parts[parts.length - 1] || 'repo';
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['PRIVATE-TOKEN'] = this.token;
    }
    return headers;
  }

  async fetchTree(): Promise<TreeNode[]> {
    let page = 1;
    let hasNextPage = true;
    const allNodes: TreeNode[] = [];
    const maxTreeNodes = 2000; // Guard to prevent infinite loops on massive repos

    while (hasNextPage && allNodes.length < maxTreeNodes) {
      const treeRes = await fetch(
        `https://gitlab.com/api/v4/projects/${this.projectPath}/repository/tree?recursive=true&per_page=100&page=${page}`,
        { headers: this.getHeaders() }
      );

      if (!treeRes.ok) {
        if (treeRes.status === 404) {
          throw new Error(`GitLab project "${decodeURIComponent(this.projectPath)}" not found or is private.`);
        }
        throw new Error(`GitLab API error: HTTP ${treeRes.status}`);
      }

      const treeData = await treeRes.json();
      if (!Array.isArray(treeData) || treeData.length === 0) {
        break;
      }

      for (const node of treeData) {
        allNodes.push({
          path: node.path,
          type: node.type === 'blob' ? 'blob' : 'tree',
          size: 0, // GitLab tree API does not return file size by default
        });
      }

      const nextPageHeader = treeRes.headers.get('x-next-page');
      if (nextPageHeader && nextPageHeader.trim() !== '') {
        const next = parseInt(nextPageHeader, 10);
        if (next > page) {
          page = next;
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }

    return allNodes;
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
              `https://gitlab.com/api/v4/projects/${this.projectPath}/repository/files/${encodeURIComponent(node.path)}/raw?ref=HEAD`,
              { headers: this.getHeaders() }
            );
            if (!res.ok) return null;
            const decoded = await res.text();
            const blob = new Blob([decoded], { type: 'text/plain' });
            const filename = node.path.split('/').pop() || node.path;
            const file = new File([blob], filename, { type: 'text/plain' });

            Object.defineProperty(file, 'webkitRelativePath', {
              value: `${this.repoName}/${node.path}`,
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
