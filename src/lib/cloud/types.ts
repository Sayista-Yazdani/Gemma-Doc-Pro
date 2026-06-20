export interface TreeNode {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

export interface RepoProvider {
  fetchTree(): Promise<TreeNode[]>;
  fetchFiles(nodes: TreeNode[], onProgress: (done: number, total: number) => void): Promise<File[]>;
}
