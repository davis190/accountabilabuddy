# Deployed environments (dev)

Account: `840385630859` · Region: `us-east-1`

## Application stack `accountabilabuddy-dev`

| Output | Value |
|---|---|
| CloudFront | https://d2fkajdnlw927r.cloudfront.net |
| API | https://uahxypwrb1.execute-api.us-east-1.amazonaws.com |
| Cognito Hosted UI | https://abb-claytondavis-dev.auth.us-east-1.amazoncognito.com |
| User pool | `us-east-1_kBejw6Qc4` |
| App client | `54hgfbe8t4hqg86ipb8aisifd3` |
| Web bucket | `accountabilabuddy-web-dev-840385630859` |

Planned custom domains (DNS pending):

- https://accountabilabuddy.claytondavis.dev (canonical)
- https://abb.claytondavis.dev
- https://accountability.claytondavis.dev

CloudFront aliases + ACM cert are already attached. Point each name as a Route 53/alias **A/AAAA → CloudFront distribution** `E16TBBPLTDCE1O` / `d2fkajdnlw927r.cloudfront.net`.

### Google OAuth redirect (already required)

```text
https://abb-claytondavis-dev.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
```

## Pipeline stack `accountabilabuddy-pipeline-dev`

| Output | Value |
|---|---|
| Pipeline | `accountabilabuddy-dev` |
| Connection | `davis190-gh` |
| Repo | `davis190/accountabilabuddy` @ `main` |

Stages: Source → Validate → Build → Deploy.
