export const autoAssignReviewerWorkflow = (args: {
  reviewers: string[];
  label: string[];
}) => {
  const template = `
name: Auto Assign Reviewer for ${args.label.join(', ')} PRs

on:
  pull_request:
    types:
      - labeled
      - opened

permissions:
  pull-requests: write

jobs:
  assign-reviewer:
    runs-on: ubuntu-latest

    steps:
    - name: Assign ${args.reviewers.join(', ')} as a reviewer
      uses: actions/github-script@v6
      with:
        github-token: \${{ secrets.EFFLUO_PAT }}
        script: |
          const reviewers = [${args.reviewers
            .map((reviewer) => `"${reviewer}"`)
            .join(',')}];
            const prCreator = context.payload.pull_request.user.login;

          // Skip assignment if the PR creator is in the reviewers list
          if (reviewers.includes(prCreator)) {
            console.log(\`Skipping reviewer assignment as PR creator (\${prCreator}) is in the reviewers list.\`);
            return;
          }
          const labels = context.payload.pull_request.labels.map(label => label.name.toLowerCase());
          if (${args.label
            .map((label) => `labels.includes('${label.toLowerCase()}')`)
            .join(' || ')}) {
            await github.rest.pulls.requestReviewers({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.payload.pull_request.number,
              reviewers: reviewers,
            });
          } else {
            console.log('No matching label found; skipping reviewer assignment.');
          }
  `;
  return template;
};
