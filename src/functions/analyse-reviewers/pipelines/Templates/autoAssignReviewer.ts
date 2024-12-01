export const autoAssignReviewerWorkflow = (args: {
  reviewers: string;
  label: string;
}) => {
  const template = `
name: Auto Assign Reviewer for ${args.label} PRs

on:
  pull_request:
    types:
      - labeled
      - opened

jobs:
  assign-reviewer:
    runs-on: ubuntu-latest

    steps:
    - name: Assign ${args.reviewers} as a reviewer
      uses: actions/github-script@v6
      with:
        script: |
          const reviewers = [${args.reviewers}];
          const labels = context.payload.pull_request.labels.map(label => label.name.toLowerCase());
          if (labels.includes(${args.label})) {
            await github.rest.pulls.requestReviewers({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.payload.pull_request.number,
              reviewers: reviewers,
            });
          } else {
            console.log('No "${args.label}" label found; skipping reviewer assignment.');
          }
`;
  return template;
};
