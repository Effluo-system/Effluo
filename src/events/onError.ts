import { app } from '../config/appConfig.ts';
import { logger } from '../utils/logger.ts';

// Optional: Handle errors
app.webhooks.onError((error) => {
  if (error.name === 'AggregateError') {
    // Log Secret verification errors
    logger.error(`Error processing request: ${error.event}`);
  } else {
    logger.error(error);
  }
});
