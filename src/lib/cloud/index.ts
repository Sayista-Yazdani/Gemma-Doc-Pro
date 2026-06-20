export * from './types';
export * from './github';
export * from './gitlab';

import { GithubProvider } from './github';
import { GitlabProvider } from './gitlab';
import type { RepoProvider } from './types';

export interface ProviderResolution {
  provider: RepoProvider;
  isGitHub: boolean;
  repoName: string;
  projectPath: string;
}

export function getCloudProvider(repoUrl: string, token?: string): ProviderResolution {
  let normalized = repoUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = 'https://' + normalized;
  }

  let urlObj: URL;
  try {
    urlObj = new URL(normalized);
  } catch {
    throw new Error('Invalid URL format. Please enter a valid repository URL.');
  }

  const host = urlObj.hostname.toLowerCase();
  const isGitLab = host.includes('gitlab.com');
  const isGitHub = host.includes('github.com');

  if (!isGitHub && !isGitLab) {
    throw new Error('Only github.com and gitlab.com public repositories are supported for direct sync.');
  }

  const pathParts = urlObj.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (pathParts.length < 2) {
    throw new Error('URL must include owner/group and repository name.');
  }

  const projectPath = pathParts.join('/');
  const repoName = pathParts[pathParts.length - 1];

  if (isGitLab) {
    return {
      provider: new GitlabProvider(projectPath, token),
      isGitHub: false,
      repoName,
      projectPath,
    };
  } else {
    const owner = pathParts[0];
    const repo = pathParts[pathParts.length - 1];
    return {
      provider: new GithubProvider(owner, repo, token),
      isGitHub: true,
      repoName,
      projectPath,
    };
  }
}
