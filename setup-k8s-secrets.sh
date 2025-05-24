#!/bin/bash

# Setup script for Kubernetes secrets
# Run this script after your EKS cluster is ready

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Kubernetes secrets for Effluo application${NC}"

# Check if kubectl is configured
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: kubectl is not configured or cluster is not accessible${NC}"
    echo "Run: aws eks update-kubeconfig --region us-east-1 --name effluo-eks-cluster"
    exit 1
fi

# === EARLY GitHub private key file path prompt and check ===
echo -e "${BLUE}=== GitHub Private Key Setup ===${NC}"
echo -e "${YELLOW}Enter the path to your GitHub App private key file:${NC}"
read PRIVATE_KEY_PATH

# Convert backslashes to forward slashes for Windows path compatibility
PRIVATE_KEY_PATH="${PRIVATE_KEY_PATH//\\//}"

# Check if private key file exists
if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo -e "${RED}Error: Private key file not found at $PRIVATE_KEY_PATH${NC}"
    exit 1
fi

# Database configuration from Terraform output
DB_HOST="effluo-db.cujkukuacaqk.us-east-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="effluo"
DB_USER="postgres"

echo -e "${BLUE}=== Database Configuration ===${NC}"
echo -e "${YELLOW}Enter your database password:${NC}"
read -s DB_PASSWORD

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}Error: Password cannot be empty${NC}"
    exit 1
fi

echo -e "${BLUE}=== GitHub App Configuration ===${NC}"
echo -e "${YELLOW}Enter your GitHub App ID:${NC}"
read APP_ID

echo -e "${YELLOW}Enter your GitHub Webhook Secret:${NC}"
read -s WEBHOOK_SECRET

echo -e "${YELLOW}Enter your GitHub Client ID:${NC}"
read GITHUB_CLIENT_ID

echo -e "${YELLOW}Enter your GitHub Client Secret:${NC}"
read -s GITHUB_CLIENT_SECRET

echo -e "${YELLOW}Enter your GitHub Token:${NC}"
read -s GITHUB_TOKEN

echo -e "${BLUE}=== API Keys ===${NC}"
echo -e "${YELLOW}Enter your Gemini API Key:${NC}"
read -s GEMINI_API_KEY

# Create the full database URL
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo -e "${GREEN}Creating Kubernetes secrets...${NC}"

# Delete existing secrets if they exist (ignore errors)
kubectl delete secret effluo-secrets --ignore-not-found=true
kubectl delete secret effluo-github-key --ignore-not-found=true

# Create the main application secret
kubectl create secret generic effluo-secrets \
    --from-literal=DATABASE_URL="$DATABASE_URL" \
    --from-literal=DB_USER="$DB_USER" \
    --from-literal=DB_PASSWORD="$DB_PASSWORD" \
    --from-literal=DB_HOST="$DB_HOST" \
    --from-literal=DB_PORT="$DB_PORT" \
    --from-literal=DB_NAME="$DB_NAME" \
    --from-literal=APP_ID="$APP_ID" \
    --from-literal=WEBHOOK_SECRET="$WEBHOOK_SECRET" \
    --from-literal=GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID" \
    --from-literal=GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET" \
    --from-literal=GITHUB_TOKEN="$GITHUB_TOKEN" \
    --from-literal=GEMINI_API_KEY="$GEMINI_API_KEY"

# Create a separate secret for the private key file
kubectl create secret generic effluo-github-key \
    --from-file=private-key.pem="$PRIVATE_KEY_PATH"

echo -e "${GREEN}✅ Secrets created successfully!${NC}"

# Verify the secrets
echo -e "${GREEN}Verifying secrets...${NC}"
kubectl get secret effluo-secrets
kubectl get secret effluo-github-key

echo -e "${GREEN}🎉 Setup complete! You can now deploy your application.${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Push your code to the main branch to trigger the CI/CD pipeline"
echo "2. Monitor the deployment: kubectl get pods -w"
echo "3. Check the service: kubectl get svc effluo-app-service"

echo -e "${BLUE}Secret summary:${NC}"
echo "• effluo-secrets: Contains all API keys and database credentials"
echo "• effluo-github-key: Contains your GitHub App private key file"
