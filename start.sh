#!/bin/bash
set -e

# Start smee in background
npx smee -u https://smee.io/gkuUaogY4rLvZSb -t http://localhost:3000/api/webhook &

# Start your app in background
npm run dev &

# Wait for both background jobs
wait -n

# If any process exits, kill the other(s) and exit with error
exit $?
