export type UserReviewSummary = {
  [userName: string]: {
    [prCategory: string]: number;
  };
};
