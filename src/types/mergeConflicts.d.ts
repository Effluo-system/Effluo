export type UserReviewSummary = {
  [repoId: string]: {
    [user: string]: {
      [label: string]: number;
    };
  };
};

export type WorkData = {
  [category: string]: number;
};

export type RepoData = {
  [repoId: string]: {
    [person: string]: WorkData;
  };
};

export type FrequencySummaryResult = {
  [repoId: string]: FrequencySummaryResultForEachRepo;
};

export type FrequencySummaryResultForEachRepo = {
  [category: string]: string;
};

export interface FileVersion {
  content: string;
  sha: string;
  ref: string;
}

export interface ConflictData {
  filename: string;
  base: FileVersion;
  ours: FileVersion;
  theirs: FileVersion;
}

export interface ResolutionData {
  filename: string;
  resolvedCode: string;
  baseContent?: string;
  oursContent?: string;
  theirsContent?: string;
  fileData?: ConflictData;
  oursBranch?: string;
  theirsBranch?: string;
}

export interface CommitCommand {
  filename: string;
  comment_id: number;
  user: string;
  timestamp: string;
}

export interface CommitResolutionCommandResponse {
  applyAll: boolean;
  commentId?: number;
  user?: string;
  commandTimestamp?: string;
}
