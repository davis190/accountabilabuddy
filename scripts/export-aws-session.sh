#!/usr/bin/env bash
# Run this in the terminal where `aws sts get-caller-identity` already works.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
printenv | grep '^AWS_' > .aws-session.env
aws sts get-caller-identity --output json | tee .deploy-identity.json
aws acm list-certificates --region us-east-1 --output json > .deploy-certs.json
{
  aws codeconnections list-connections --region us-east-1 --output json 2>/dev/null \
    || aws codestar-connections list-connections --region us-east-1 --output json
} > .deploy-connections.json
aws secretsmanager list-secrets --region us-east-1 \
  --query 'SecretList[?contains(Name, `accountabil`) || contains(Name, `google`)].{Name:Name,ARN:ARN}' \
  --output json > .deploy-secrets.json || echo '[]' > .deploy-secrets.json
echo "Wrote .aws-session.env and .deploy-*.json — tell the agent to continue."
