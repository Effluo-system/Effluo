async function extractPRInfo(octokit, owner, repo, pullNumber) {
    try {
      // Get basic PR information
      const { data: prData } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });
  
      // Get all reviews
      const { data: reviews } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
      });
  
      // Get all comments
      const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: pullNumber,
      });
  
      // Get review comments (comments on specific lines of code)
      const { data: reviewComments } = await octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pullNumber,
      });
  
      // Process and structure the data
      const processedData = {
        basicInfo: {
          title: prData.title,
          description: prData.body || '',
          state: prData.state,
          createdAt: prData.created_at,
          updatedAt: prData.updated_at,
          author: prData.user.login,
          isDraft: prData.draft,
          labels: prData.labels.map(label => label.name),
          branches: {
            base: prData.base.ref,
            head: prData.head.ref
          }
        },
        reviews: reviews.map(review => ({
          id: review.id,
          state: review.state,
          author: review.user.login,
          submittedAt: review.submitted_at,
          body: review.body || '',
        })),
        comments: comments.map(comment => ({
          id: comment.id,
          author: comment.user.login,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          body: comment.body,
        })),
        reviewComments: reviewComments.map(comment => ({
          id: comment.id,
          author: comment.user.login,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          body: comment.body,
          path: comment.path,
          line: comment.line,
          diffHunk: comment.diff_hunk,
        })),
        statistics: {
          totalReviews: reviews.length,
          totalComments: comments.length,
          totalReviewComments: reviewComments.length,
          reviewStates: reviews.reduce((acc, review) => {
            acc[review.state] = (acc[review.state] || 0) + 1;
            return acc;
          }, {}),
        }
      };
  
      return processedData;
    } catch (error) {
      const customError = error as CustomError;
      if (customError.response) {
        logger.error(
          Failed to extract PR info for PR #${pullNumber}. Status: ${customError.response.status}. Message: ${customError.response.data.message}
        );
      } else {
        logger.error(
          Failed to extract PR info for PR #${pullNumber}: ${customError.message || 'Unknown error'}
        );
      }
      
      // Return null to indicate the operation failed
      return null;
    }
  }