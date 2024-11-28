export type UserReviewSummary = {
  [repoId: string]: {
    [user: string]: {
      [label: string]: number;
    };
  };
};
