# Accountabilabuddy

Lightweight habit accountability for supportive groups. Mobile-first PWA: Google sign-in (Cognito), multiple isolated groups, daily check-offs, uncapped weekly points, friendly ties, full group-local history, and optional email reminders.

Product rules and acceptance criteria live in [`spec.md`](./spec.md).

## Monorepo layout

| Path | Purpose |
|---|---|
| `packages/shared` | Domain types, week math, scoring, ties, validation, IDs |
| `apps/api` | Hono API (local Node server + Lambda handler) |
| `apps/web` | React PWA (Vite) |
| `infra/` | SAM/CloudFormation app stack, CodePipeline, buildspecs |

## Local development

```bash
npm install
npm run dev
```

- Web: http://localhost:5173

- API: http://localhost:3001 (`AUTH_MODE=dev`, in-memory store)

Dev sign-in uses `Authorization: Bearer dev:userId|email|name`. The landing page “Continue (dev sign-in)” sets this automatically.

```bash
npm test
npm run build
```

## Core product rules (enforced in shared + API)

- One point per goal per local day; weekly frequency does **not** cap points (`4/2` still contributes 4).
- Groups are fully isolated (goals, targets, history, reminders).
- Weekly comparison allows ties (`1, 2, 2, 4`); no hidden tie-breakers.
- Completions are idempotent; future dates rejected; only the owner may write their check-offs.

## AWS deployment

Prerequisites (outside CloudFormation): Google OAuth client, SES identity/domain, Route 53 hosted zone if using a custom domain, CodeConnections to GitHub.

```bash
# Application stack (dev)
sam deploy \
  --template-file infra/template.yaml \
  --stack-name accountabilabuddy-dev \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --resolve-s3 \
  --parameter-overrides Environment=dev AppOrigin=https://your-cloudfront-domain

# Pipeline (once per account/env)
aws cloudformation deploy \
  --template-file infra/pipeline.yaml \
  --stack-name accountabilabuddy-pipeline-dev \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    GitHubConnectionArn=arn:aws:codeconnections:... \
    GitHubOwner=your-org \
    AppOrigin=https://your-app-origin
```

The pipeline stages: Source → Validate (lint/tests/typecheck) → Build → Manual approval → Deploy (SAM + S3 sync).

## Auth modes

| Mode | When | Notes |
|---|---|---|
| `AUTH_MODE=dev` | Local | Implicit or `Bearer dev:…` header |
| `AUTH_MODE=cognito` | Deployed | API validates Cognito JWTs; Google federated via Cognito IdP |

Wire Google as a Cognito identity provider after the user pool exists (secret in Secrets Manager; never commit).

## Notifications

Per-membership daily/weekly preferences. Delivery uses SES when `SES_FROM_EMAIL` is set; otherwise emails log to the API console. Deduplication uses the notification delivery ledger. EventBridge Scheduler role is provisioned; attach per-membership schedules when enabling reminders in production.

## License

Private — all rights reserved.
