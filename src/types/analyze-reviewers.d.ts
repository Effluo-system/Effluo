export type UserReviewSummary = {
  [repoId: string]: {
    [user: string]: {
      [label: string]: number;
    };
  };
};

export type WorkData = {
  [category: string]: number; // Categories are strings, and their work counts are numbers
};

export type RepoData = {
  [repoId: string]: {
    // Repos are indexed by repoId, each repo has people working on it
    [person: string]: WorkData; // Each person has a WorkData object
  };
};

export type FrequencySummaryResult = {
  [repoId: string]: FrequencySummaryResultForEachRepo;
};

export type FrequencySummaryResultForEachRepo = {
  [category: string]: string;
};

export type CommittableFile = {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'commit' | 'tree' | 'blob';
  sha?: string | null;
  content: string;
};
