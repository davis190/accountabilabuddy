# Accountabilabuddy

## Product and Technical Specification

**Status:** MVP specification  
**Version:** 1.0  
**Last updated:** October 19, 2026  
**Primary platform:** Mobile-first responsive web application / installable PWA  
**Deployment target:** AWS using CloudFormation, CodePipeline, and CodeBuild

---

## 1. Executive summary

Accountabilabuddy is a lightweight habit-accountability app for people who want to eat better, exercise more, or build other positive routines without calorie counting, macro tracking, or complicated planning.

Users sign in with Google, create or join multiple independent groups, define personal goals within each group, choose a weekly point target, and check off completed goals by day. Each distinct goal completed on a day earns one point. A configured weekly frequency is a planning target, not a scoring cap: if a user sets “Run” to twice per week and runs on four different days, the user earns four points.

Group members can see one another’s weekly progress and full daily check-off history for that group. The tone is supportive rather than punitive: rankings are a friendly comparison, equal scores remain tied, and the product does not manufacture tie-breakers. Optional daily reminders and weekly check-ins are part of the MVP.

The product should make the most common action—logging today—possible in a few taps on a phone.

---

## 2. Definitive product decisions

These decisions are authoritative throughout this specification.

1. **Multiple independent groups:** A user may create and join multiple groups. Membership, goals, point targets, history, roles, and leaderboards are scoped to one group and are not exposed to another group.
2. **One point per goal per completed day:** Checking off one goal for one local calendar day earns one point. The same goal cannot earn more than one point on the same day.
3. **Weekly frequency does not cap points:** A goal’s configured frequency communicates intent and measures target attainment. Every additional completed day still earns a point. Example: a “Run 2x/week” goal completed on four days earns four points and shows `4 / 2`.
4. **Full group-visible history:** Every active member of a group may view every other active member’s complete daily check-off history for that group, subject to retention and account-deletion rules. No activity from another group is visible.
5. **Friendly comparison, ties allowed:** Weekly comparisons show progress and points. Equal scores and equal progress are displayed as ties; no hidden or arbitrary tie-breaker is used.
6. **MVP reminders:** Users may opt into a daily reminder and a weekly check-in for each group. Both are optional and configurable.

---

## 3. Product principles

- **Behavior over measurement:** Track actions, not calories, weight, pace, or macros.
- **Fast enough to use daily:** Today’s check-off list is immediately available after sign-in.
- **Flexible, not brittle:** Extra positive days count; missed days do not create debt.
- **Supportive accountability:** Encourage consistency without shame, punishment, or forced competition.
- **Privacy by group:** Membership in one group reveals nothing about another.
- **Transparent scoring:** A user can understand any total by opening its daily history.
- **Accessible by default:** Large touch targets, semantic controls, visible focus, adequate contrast, and plain language.

---

## 4. Goals and non-goals

### 4.1 MVP goals

- Authenticate securely with Google.
- Let a person create, join, switch among, and leave multiple independent groups.
- Let each member define and manage their own goals in each group.
- Let each member set their own weekly point target per group.
- Make today’s goals quick to check or uncheck.
- Support logging and correcting recent or older days.
- Calculate weekly points and goal-frequency progress predictably.
- Show a friendly weekly comparison with ties.
- Show every group member’s full daily check-off history within that group.
- Deliver optional daily reminders and weekly check-ins.
- Deploy repeatably on AWS through infrastructure as code and an automated pipeline.

### 4.2 Non-goals for MVP

- Calorie, macro, weight, distance, duration, or biometric tracking.
- Wearable or fitness-platform integration.
- Public discovery, public profiles, or cross-group leaderboards.
- Direct messaging, comments, reactions, or a social feed.
- Money, wagering, punishments, or prizes administered by the app.
- AI coaching or medical advice.
- Native iOS or Android applications.
- Organization-wide administration or enterprise SSO.
- Multiple completions of the same goal on the same day.
- Automated tie-breakers, streak-based score bonuses, or frequency caps.

---

## 5. Users and personas

### 5.1 The low-effort improver

Wants a handful of meaningful habits without a detailed health program. Usually logs from a phone at the end of the day. Needs a simple checklist, forgiving backfill, and progress that is easy to interpret.

**Success:** Can log a day in under 20 seconds and see whether the week is broadly on track.

### 5.2 The accountability pair

Two friends or partners who want mutual visibility. They care more about showing up than “winning.” They need trustworthy history, a shared view, ties, and a weekly prompt to talk.

**Success:** Either person can see exactly which goals the other completed on each day.

### 5.3 The multi-context member

Participates in separate groups—for example, a running group, a household group, and a work wellness group. Goals and preferred targets may differ by group.

**Success:** Can switch groups quickly and never leaks a goal, score, history entry, or notification setting between them.

### 5.4 The organizer

Creates a small group, shares an invitation, and keeps membership tidy. Is not a professional administrator and should not need configuration training.

**Success:** Can invite people and remove a member, but cannot edit another member’s goals or history.

### 5.5 The privacy-conscious member

Accepts that members of a joined group see complete group history, but expects unrelated groups and outsiders to see nothing.

**Success:** Visibility is explained before joining, authorization is enforced server-side, and leaving immediately removes routine access.

---

## 6. Core concepts and rules

### 6.1 Group

A private accountability space with a name, stable identifier, members, invitations, and a group-local week definition. A user may belong to many groups. There is no aggregate cross-group leaderboard in MVP.

Default group settings:

- Week begins Monday.
- Display timezone initially follows the creator’s timezone, but scoring dates are based on each member’s timezone.
- Members can invite others unless an owner disables member invitations.
- Full group-visible daily history is always on and cannot be reduced per member in MVP; this is disclosed before joining.

### 6.2 Membership and roles

- **Owner:** Rename group, manage invitation policy, remove members, transfer ownership, and delete the group.
- **Member:** Manage only their own goals, logs, point target, timezone, and reminder settings; view group roster, comparison, and all group-local member history.
- Each group must have exactly one owner.
- A user may own and join multiple groups.
- Roles are independent across groups.
- If the owner leaves, ownership must first be transferred or, if they are the only member, the group may be deleted.
- Removing or leaving a group immediately blocks access to its APIs and UI. Historical records may be retained internally for the retention period but are no longer available to the departed member. The remaining group sees a neutral “Former member” label where needed unless deletion policy requires anonymization.

### 6.3 Goal

A group-scoped personal behavior a member wants to repeat. Fields:

- Name, required, 1–60 characters.
- Optional emoji/icon selected from a safe built-in set.
- Target days per week, integer 1–7.
- Active start date.
- Optional archived date.
- Optional short description, maximum 160 characters.
- Sort order.

Examples: Run, Lift, Stretch 10+ minutes, No food after dinner, Protein-rich breakfast, Vegetable-heavy lunch with protein, Vegetables with dinner, 10-minute walk.

Target days per week is guidance and a secondary progress measure. It never caps points.

### 6.4 Completion

A completion is uniquely identified by `(groupId, userId, goalId, localDate)`.

- A completion can be checked or unchecked by its owner.
- One completion equals one point.
- Repeated taps are idempotent and never create duplicate points.
- A goal can earn at most one point per local calendar date.
- Different goals completed on the same day each earn one point.
- Logging past dates is allowed for the member’s full retained history. The UI emphasizes the current week and requires an intentional date selection for older edits.
- Future dates cannot be completed.
- Archived goals retain history but cannot receive new completions after their archive date.
- Changing a goal’s name or target does not rewrite historical completion points. History displays the current name in MVP; an audit snapshot may be added later.

### 6.5 Weekly point target

Each membership has its own `weeklyPointTarget`, a positive integer. The recommended default equals the sum of the member’s active goal frequencies, but the user may choose another value.

- Points earned are not capped by the weekly target.
- Progress percent is `pointsEarned / weeklyPointTarget × 100`.
- The UI may display more than 100%; it must not clamp earned points or replace `12 / 10` with `10 / 10`.
- Changing a target applies to the current and future weekly displays. To preserve historical meaning, a weekly snapshot of the target is recorded when a week first receives a completion or closes. Historical screens use that snapshot.
- A user can set different targets in different groups.
- When Away days exist in a week, the **effective** weekly target for progress is lowered (see §6.7). Snapshots for open weeks store the Away-adjusted values.

### 6.7 Away days

A member may mark local calendar days as **Away** (travel/vacation). Away is per person (applies across all groups), visible to group members, and intended as a light control for occasional trips.

Rules:

- Away may only be set or cleared for dates in the member’s **current week** (Monday-start week in the member’s timezone), including future days in that week.
- Check-offs are blocked on Away days. Marking Away **clears** any completions already logged that day across all groups. Clearing Away does not restore those completions.
- Targets for the week adjust **live** as soon as Away days are set.

Adjustment formula, with `availableDays = 7 − awayDayCount`:

```text
adjustedGoalTarget =
  0                                           if availableDays = 0
  max(1, round(targetDaysPerWeek × availableDays / 7))   otherwise

reduction = sum(originalGoalTarget − adjustedGoalTarget) across active goals

adjustedWeeklyPointTarget =
  0                                           if availableDays = 0
  max(1, weeklyPointTarget − reduction)       otherwise
```

`round` is half-up. Goal and weekly floors are 1 unless the entire week is Away (then 0).

### 6.6 Week and timezone

- A week is seven local calendar days beginning on the group’s configured start day (Monday by default).
- A completion’s date is stored as the member-selected local date, not inferred later from UTC.
- Each member has an IANA timezone, initially detected by the browser and confirmed during onboarding.
- The member’s timezone determines “today,” future-date validation, and reminder delivery.
- Weekly comparison uses the group’s week start and each member’s completion `localDate`. Group members see the same labeled date range.
- Timezone changes affect future “today” and notifications; existing `localDate` values do not move.
- Daylight saving changes are handled by IANA timezone rules. Notifications remain at the chosen local wall-clock time.

---

## 7. Scoring and comparison

### 7.1 Point formula

For user `u`, group `g`, and week `w`:

```text
weeklyPoints(u,g,w) = count(distinct completion records
  where groupId = g
  and userId = u
  and localDate is within w)
```

The uniqueness constraint ensures one record for each goal per day. Goal frequency is not present in the point formula.

Example:

| Goal | Target | Completed days | Points |
|---|---:|---|---:|
| Run | 2/week | Mon, Wed, Fri, Sun | 4 |
| Lift | 2/week | Tue | 1 |
| Stretch | 2/week | Tue, Thu | 2 |
| **Total** | — | — | **7** |

“Run” displays `4 / 2` and contributes all four points.

### 7.2 Friendly comparison

The weekly comparison shows, for each active member:

- Display name and avatar.
- Points earned.
- Personal weekly point target.
- Progress percentage.
- Goal-level target progress, optionally expandable.
- Status such as “On track,” “Target reached,” or “Keep going,” using neutral copy.

Default ordering is progress percentage descending, then points descending, with exact equals sharing a tied position. Any remaining stable ordering is alphabetical only for rendering and is not described as a rank or tie-break.

Example positions: `1, 2, 2, 4`. Two equal members both display “2nd (tied).” The app does not use completion time, streak, target difficulty, creation time, or user ID to break a tie.

Because members choose their own goals and targets, the comparison is motivational, not a claim of objective athletic performance. The UI must say this concisely.

### 7.3 Streaks

Streaks are excluded from MVP scoring. If added later, they must be informational only unless a future product decision explicitly changes scoring.

---

## 8. Key user journeys

### 8.1 First sign-in

1. User chooses “Continue with Google.”
2. Cognito completes Google federation and returns secure application tokens.
3. App asks for display name confirmation and timezone.
4. App presents two choices: create a group or join with an invitation.
5. Before joining, the app states: “Members of this group can see your goals and full daily check-off history in this group.”
6. User creates or joins, sets goals, and accepts or edits the recommended weekly point target.
7. User optionally enables daily and weekly email notifications.
8. User lands on Today.

### 8.2 Create a group

1. Enter group name.
2. Confirm week start and invitation policy.
3. Add personal goals or choose editable examples.
4. Set personal weekly point target.
5. Create an expiring invitation link.

### 8.3 Join another group

1. Open invitation link while signed in, or sign in first.
2. Review group name, owner, member count, and full-history visibility disclosure.
3. Accept invitation.
4. Configure goals and weekly target specifically for this group.
5. Configure optional reminders for this group.

No goals, history, points, or preferences are copied from existing groups unless a later explicit “copy goals” feature is added.

### 8.4 Log today

1. Today opens to the last-used group.
2. User sees active goals as large check rows.
3. Tapping an unchecked row checks it, updates points optimistically, and sends an idempotent request.
4. Tapping again asks for no confirmation and removes the completion, with a short Undo toast.
5. A compact week strip lets the user choose another date.
6. If the request fails, the UI restores the prior state and explains that it was not saved.

### 8.5 Log past days

1. User selects a day from the week strip or history calendar.
2. App shows goals active on that date and their check states.
3. User checks or unchecks their own entries.
4. The weekly total and group comparison update.

### 8.6 Compare the week

1. User opens Week.
2. App shows the date range and a list of members with points and target progress.
3. Equal results show tied positions.
4. User taps a member to open that member’s complete group-local history.
5. User may navigate to earlier weeks within retained history.

### 8.7 Configure reminders

1. In group settings, user toggles Daily reminder and selects a local time.
2. User toggles Weekly check-in and selects a local weekday and time, defaulting to Sunday evening.
3. User confirms email delivery and may send a test notification.
4. Changes are effective for the next scheduled occurrence.

---

## 9. Information architecture and mobile UX

### 9.1 Primary navigation

A bottom navigation bar with no more than four items:

- **Today:** Fast check-off and seven-day date strip.
- **Week:** Personal summary and group comparison.
- **History:** Calendar/list history, self by default, with member selector.
- **Settings:** Group, goals, target, notifications, account.

The active group appears in a compact header switcher. Switching groups updates the entire screen context and uses a distinct group name; it never combines totals.

### 9.2 Today screen

- Date and group name visible at the top.
- Personal progress: `8 / 10 points this week` and an unclamped visual indicator if above target.
- Goal rows at least 44×44 CSS pixels, preferably 48 pixels tall.
- Checked state conveyed by icon, text, and color—not color alone.
- Per-goal weekly count such as `Run · 4/2 this week`.
- Empty state directs the user to add their first goal.
- Offline or save-failure state is explicit; MVP does not promise offline writes.

### 9.3 Week screen

- Week date range and previous/current navigation.
- Friendly language; avoid “loser,” red failure states, or podium theatrics.
- Member comparison shows both raw points and individual targets to avoid misleading rank-only views.
- Ties are labeled.
- Tapping any member opens a read-only drill-down of that member’s goals and daily checks in this group.

### 9.4 History screen

- Calendar heatmap or simple month grid with accessible list alternative.
- Member selector contains active group members only.
- A day detail lists completed and not-completed goals that were active that day.
- Viewing another member is always read-only.
- Older weeks load incrementally; do not send an entire long history to the device at once.

### 9.5 Accessibility and performance

- Meet WCAG 2.2 AA for core flows.
- Full keyboard operation and screen-reader labels.
- Respect reduced-motion preference.
- Initial usable content target: under 2.5 seconds on a typical 4G mobile connection after CDN caching, subject to field measurement.
- Check-off acknowledgment target: optimistic response under 100 ms; confirmed API p95 under 500 ms within the deployed region, excluding cold-start outliers during early tuning.
- Avoid large client bundles; lazy-load History and Settings.

---

## 10. Functional requirements

### 10.1 Authentication and account

- Google is the only MVP identity provider.
- AWS Cognito User Pool federates to Google through OIDC.
- Do not accept Google ID tokens directly at business APIs; APIs validate Cognito-issued JWTs through API Gateway authorizers.
- Store Cognito subject as the immutable identity key; email is not a primary key.
- User can update display name, timezone, and notification consent.
- User can sign out on the current device.
- Account deletion removes or anonymizes personal data according to the retention policy and transfers or deletes owned groups through an explicit flow.

### 10.2 Groups and invitations

- Create, list, read, update, leave, and delete a group subject to role rules.
- A user can belong to multiple groups; an initial soft limit of 20 active memberships protects abuse and may be raised administratively.
- Invitations use high-entropy, single-purpose tokens stored only as hashes.
- Invitation includes group ID, creator, expiration, maximum uses, current use count, and revoked state.
- Default expiration is seven days; owner/member may revoke invitations they created.
- Accepting an invitation is idempotent and does not create duplicate membership.
- Invitation preview exposes only group name, owner display name, member count, expiration, and privacy disclosure.

### 10.3 Goals and targets

- Members CRUD and reorder only their own group-scoped goals.
- Names are trimmed and rendered as plain text; no HTML.
- Archive rather than hard-delete a goal that has completions.
- Weekly target is stored on membership and must be 1–100 in MVP.
- The system recommends, but does not force, the sum of active goal frequencies.

### 10.4 Logging

- Create and delete own completions for allowed dates.
- Idempotent create returns the existing completion if already checked.
- Idempotent delete succeeds if already absent.
- Server validates membership, goal ownership, group match, goal active date, local date, and non-future date.
- A member can never write another member’s completion.
- Mutation returns updated personal weekly totals for responsive reconciliation.

### 10.5 History and comparison

- Active members can read any current or former-visible member’s daily history only within the shared group.
- API results are paginated and bounded by requested date range.
- Current and past week summaries use stored target snapshots when available.
- Newly joined members can see retained group history that the group is authorized to show, including pre-join history of existing members. Their own history begins when their goals begin.
- A member removed from a group can no longer query its history.

### 10.6 Notifications

- Notification channels in MVP: email and in-app notification status. Browser push and SMS are out of scope.
- Daily reminder is per membership, opt-in, and configured with local time.
- Daily email names the group and links directly to Today in that group. It may include how many goals are unchecked today, but no other member’s sensitive history.
- Weekly check-in is per membership, opt-in, and configured with local weekday/time.
- Weekly email summarizes personal points/target, goal counts including over-target counts, tied position if applicable, and a link to the group Week view.
- A user can disable either notification independently.
- Every email contains an unsubscribe/settings link. Transactional invitation email, if added, is separate from reminder consent.
- Scheduler delivery is at-least-once; the notification ledger suppresses duplicates for the same membership, notification type, and scheduled local occurrence.
- Failed delivery is retried with backoff and sent to a dead-letter queue after the configured maximum.
- Do not send a reminder after a membership is inactive, a group is deleted, or the user disables the preference.

---

## 11. Authorization and privacy model

### 11.1 Authorization matrix

| Action | Visitor | Group member | Group owner | Resource owner |
|---|---:|---:|---:|---:|
| View invitation preview | Valid token only | Valid token only | Valid token only | — |
| View group roster/comparison | No | Yes | Yes | — |
| View full group-local daily history | No | Yes | Yes | — |
| Create/edit own goals and target | No | — | — | Yes |
| Create/delete own completions | No | — | — | Yes |
| Edit another member’s goals/logs | No | No | No | No |
| Invite under enabled policy | No | Policy-dependent | Yes | — |
| Remove another member | No | No | Yes | — |
| Rename/delete group | No | No | Yes | — |

Owner status does not grant write access to another member’s goals or check-offs.

### 11.2 Enforcement

- Every group-scoped API derives `userId` from the validated Cognito token, never from a trusted client field.
- A shared authorization module checks active membership before any group read.
- Write endpoints additionally check resource ownership.
- DynamoDB keys include `groupId`; queries begin from the authorized group partition and never perform cross-group client filtering.
- Cache keys include identity/group authorization context. Private API responses are not cached by CloudFront in MVP.
- S3 hosts only static application assets, never private JSON history.
- Logs must not include OAuth tokens, raw invitation tokens, email contents, or full completion payloads.
- CloudTrail, CloudWatch, AWS Config where appropriate, encryption at rest, TLS in transit, least-privilege IAM, and Secrets Manager/SSM Parameter Store are required.

### 11.3 Privacy disclosures and controls

- Before joining, explicitly disclose full daily-history visibility.
- Settings repeats who can see the user’s data.
- No public URLs expose group history.
- Search engines are blocked from authenticated routes and invitation details.
- Export and deletion are desirable shortly after MVP; deletion is required for launch even if export is manual initially.
- Product analytics use pseudonymous identifiers and do not collect goal names unless necessary and disclosed.

### 11.4 Retention

- Completion history is retained while the account/group is active unless deleted under policy.
- Revoked/expired invitation records: 90 days for security investigation, then delete.
- Notification delivery ledger: 90 days.
- Application logs: default 30 days; security/audit logs according to the operating policy.
- Account deletion completes within the published period and anonymizes shared historical aggregates where deletion would otherwise corrupt other members’ week records.

---

## 12. Data model

Use DynamoDB with explicit access patterns. A single-table design is possible, but separate tables are recommended for MVP clarity and safer TTL/index management.

### 12.1 Tables

#### Users

Primary key: `userId` (Cognito `sub`)

Fields: `email`, `displayName`, `avatarUrl`, `timezone`, `createdAt`, `updatedAt`, `accountStatus`, `termsAcceptedAt`.

Email and avatar originate from Google but are cached application attributes and may change.

#### Groups

Primary key: `groupId`

Fields: `name`, `ownerUserId`, `weekStartsOn`, `memberInviteEnabled`, `status`, `createdAt`, `updatedAt`, `version`.

#### Memberships

Primary key: `groupId`  
Sort key: `userId`

Fields: `role`, `status`, `joinedAt`, `leftAt`, `weeklyPointTarget`, `targetEffectiveAt`, `dailyReminderEnabled`, `dailyReminderLocalTime`, `weeklyCheckInEnabled`, `weeklyCheckInDay`, `weeklyCheckInLocalTime`, `timezone`, `lastUsedAt`.

GSI `MembershipsByUser`: partition `userId`, sort `joinedAt`, for listing a user’s groups.

#### Goals

Primary key: `groupUserKey = groupId#userId`  
Sort key: `goalId`

Fields: `groupId`, `userId`, `name`, `icon`, `description`, `targetDaysPerWeek`, `activeFrom`, `archivedAt`, `sortOrder`, `createdAt`, `updatedAt`, `version`.

#### Completions

Primary key: `groupUserWeek = groupId#userId#weekStartDate`  
Sort key: `localDate#goalId`

Fields: `completionId`, `groupId`, `userId`, `goalId`, `localDate`, `weekStartDate`, `createdAt`, `updatedAt`.

This key provides uniqueness and efficient per-member weekly history. A conditional put prevents duplicates.

GSI `CompletionsByGoal`: partition `groupId#userId#goalId`, sort `localDate`, supports goal history and safe archival checks. Broader history is obtained by bounded week queries, not scans.

#### WeeklySnapshots

Primary key: `groupWeek = groupId#weekStartDate`  
Sort key: `userId`

Fields: `weeklyPointTargetSnapshot`, `points` (derived cache), `goalTargetSnapshot`, `lastRecalculatedAt`, `version`.

Completions remain the source of truth. Snapshot updates use DynamoDB transactions or asynchronous reconciliation and can be rebuilt. API responses must not silently serve a stale score after a successful write; the mutation response calculates from source or transactionally updates the cache.

#### Invitations

Primary key: `invitationId`

Fields: `groupId`, `tokenHash`, `createdBy`, `expiresAt`, `maxUses`, `useCount`, `revokedAt`, `createdAt`, `ttl`.

GSI on `tokenHash` supports redemption. Never store the raw token.

#### NotificationDeliveries

Primary key: `deliveryKey = membershipKey#type#scheduledOccurrence`  
Sort key: `attempt`

Fields: `status`, `sesMessageId`, `scheduledFor`, `sentAt`, `errorCode`, `createdAt`, `ttl`.

The first delivery record uses a conditional write as a deduplication lock.

### 12.2 Consistency and concurrency

- Completion create uses `ConditionExpression attribute_not_exists(PK)`.
- Completion delete checks ownership through the key and authenticated context.
- Membership/goal updates use an integer `version` for optimistic concurrency.
- Group ownership transfer uses a DynamoDB transaction updating group and memberships atomically.
- Invitation acceptance transaction checks token state/use count and creates membership once.
- Scores are recalculated from completion rows during reconciliation; cached totals are never the sole record.

---

## 13. API specification

Base path: `/v1`. JSON only. All authenticated endpoints require a Cognito access token. Dates use `YYYY-MM-DD`; timestamps use RFC 3339 UTC; timezones use IANA identifiers.

### 13.1 Identity

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Get profile and memberships summary |
| PATCH | `/me` | Update display name/timezone |
| DELETE | `/me` | Begin confirmed account deletion |
| PUT | `/me/away-days/{localDate}` | Mark a current-week day Away (clears check-offs) |
| DELETE | `/me/away-days/{localDate}` | Clear Away for a current-week day |

### 13.2 Groups and membership

| Method | Path | Purpose |
|---|---|---|
| GET | `/groups` | List current user’s groups |
| POST | `/groups` | Create group and owner membership |
| GET | `/groups/{groupId}` | Get group and roster |
| PATCH | `/groups/{groupId}` | Owner updates group settings |
| DELETE | `/groups/{groupId}` | Owner deletes group after confirmation |
| DELETE | `/groups/{groupId}/members/me` | Leave group |
| DELETE | `/groups/{groupId}/members/{userId}` | Owner removes member |
| POST | `/groups/{groupId}/owner-transfer` | Transfer ownership atomically |
| PATCH | `/groups/{groupId}/membership/me` | Update own target/reminder preferences |

### 13.3 Invitations

| Method | Path | Purpose |
|---|---|---|
| POST | `/groups/{groupId}/invitations` | Create invitation under policy |
| GET | `/invitations/{rawToken}/preview` | Minimal unauthenticated preview |
| POST | `/invitations/{rawToken}/accept` | Accept while authenticated |
| DELETE | `/groups/{groupId}/invitations/{invitationId}` | Revoke invitation |

Rate-limit preview and redemption endpoints. Avoid logging raw-token paths; preferably exchange the raw token in the request body to reduce URL leakage in a hardened implementation.

### 13.4 Goals

| Method | Path | Purpose |
|---|---|---|
| GET | `/groups/{groupId}/goals/me` | List own goals |
| POST | `/groups/{groupId}/goals` | Create own goal |
| PATCH | `/groups/{groupId}/goals/{goalId}` | Update/archive own goal |
| DELETE | `/groups/{groupId}/goals/{goalId}` | Delete if no history; otherwise archive |
| GET | `/groups/{groupId}/members/{userId}/goals` | Read member’s group-local goals |

### 13.5 Completions, week, and history

| Method | Path | Purpose |
|---|---|---|
| PUT | `/groups/{groupId}/completions/{localDate}/{goalId}` | Idempotently check own goal |
| DELETE | `/groups/{groupId}/completions/{localDate}/{goalId}` | Idempotently uncheck own goal |
| GET | `/groups/{groupId}/days/{localDate}/me` | Own day checklist |
| GET | `/groups/{groupId}/weeks/{weekStartDate}` | Group comparison and ties |
| GET | `/groups/{groupId}/members/{userId}/history?from=&to=&cursor=` | Full authorized history, paginated |
| GET | `/groups/{groupId}/members/{userId}/weeks/{weekStartDate}` | Member week detail |

Example completion response:

```json
{
  "completion": {
    "groupId": "grp_123",
    "goalId": "goal_run",
    "localDate": "2026-10-19",
    "points": 1
  },
  "week": {
    "weekStartDate": "2026-10-19",
    "pointsEarned": 4,
    "weeklyPointTarget": 8,
    "progressPercent": 50
  },
  "goalProgress": {
    "completedDays": 4,
    "targetDays": 2
  }
}
```

### 13.6 Notification operations

| Method | Path | Purpose |
|---|---|---|
| POST | `/groups/{groupId}/notifications/test` | Send rate-limited test to current user |
| POST | `/internal/notifications/daily` | Scheduler target; IAM-authorized only |
| POST | `/internal/notifications/weekly` | Scheduler target; IAM-authorized only |

Internal endpoints may instead be direct Lambda invocations. They must not be exposed through the public authorizer by accident.

### 13.7 API behavior

- Standard error body: `code`, `message`, `requestId`, and safe field errors.
- Use `400` invalid input, `401` missing/invalid auth, `403` authenticated but unauthorized, `404` missing or deliberately concealed resource, `409` version conflict, `429` rate limited.
- Pagination uses opaque signed cursors.
- Mutation requests accept `Idempotency-Key` where retries could create a resource.
- CORS allows only configured application origins.

---

## 14. AWS architecture

### 14.1 Request path

```text
Mobile browser / PWA
  -> Route 53
  -> CloudFront + AWS WAF
      -> S3 private origin (HTML/CSS/JS via Origin Access Control)
      -> API Gateway HTTP API (/api/*, no private-response caching)
          -> Cognito JWT authorizer
          -> Lambda functions
              -> DynamoDB tables
              -> EventBridge Scheduler
              -> Amazon SES
              -> CloudWatch / X-Ray
```

### 14.2 Front end

- TypeScript web application, recommended React with a small router and query cache.
- Responsive, mobile-first, installable PWA manifest.
- Static production build in a private S3 bucket.
- CloudFront Origin Access Control; S3 Block Public Access enabled.
- History API fallback to `index.html` through CloudFront function/error mapping without converting real asset 404s indiscriminately.
- Content-Security-Policy, HSTS, Referrer-Policy, Permissions-Policy, and secure cache headers.
- Hashed assets cached long-term; HTML cached briefly and invalidated on deployment.

### 14.3 Authentication

- Cognito User Pool with Google as OIDC identity provider.
- Cognito managed login or carefully branded hosted UI for MVP.
- OAuth 2.0 Authorization Code flow with PKCE.
- Short-lived access tokens. Avoid localStorage for long-lived secrets; use a reviewed secure token strategy appropriate to the chosen SDK and XSS threat model.
- Google client secret stored in Secrets Manager and referenced by deployment, never committed.

### 14.4 Backend

- API Gateway HTTP API for lower cost and native JWT authorizer.
- Lambda functions grouped by bounded capability: profiles, groups/invitations, goals/completions, history/comparison, notification preferences/delivery.
- TypeScript/Node.js current supported LTS runtime.
- Shared validation and authorization library.
- DynamoDB on-demand capacity for MVP, point-in-time recovery enabled in production.
- AWS Powertools for structured logging, tracing, metrics, and idempotency where useful.

### 14.5 Notifications

- EventBridge Scheduler creates two schedules per opted-in membership: daily and weekly.
- Schedule expressions include the user’s IANA timezone and flexible time window disabled or narrowly configured.
- Schedule target is a notification Lambda with minimal payload: group ID, user ID, type, and schedule revision—not private history.
- Lambda rechecks active membership and current preference at send time, acquires a deduplication record, computes summary, and sends through SES.
- SES configuration set publishes bounce/complaint events. Repeated permanent bounces suppress further reminder mail and surface a settings warning.
- Scheduler execution role may invoke only the notification Lambda.
- Alternative at larger scale: one recurring dispatcher plus time-bucketed schedule rows. Do not use table scans as the permanent design.

### 14.6 Observability and operations

- Structured logs with `requestId`, hashed/pseudonymous user ID, route, latency, status, and cold-start indicator.
- CloudWatch dashboards: API error rate/latency, Lambda errors/throttles/duration, DynamoDB throttles, Scheduler failures, SES send/bounce/complaint rates, DLQ depth.
- Alarms route to an operations topic/integration configured outside application reminders.
- X-Ray tracing sampled in production.
- CloudTrail enabled at account level; alarms for sensitive infrastructure changes are recommended.
- Runbooks cover authentication outage, notification backlog, elevated API errors, rollback, and compromised invitation links.

### 14.7 Environments and domains

- Separate `dev`, `staging`, and `prod` stacks; production should use a separate AWS account where feasible.
- Example: `app.accountabilabuddy.example` and `api.accountabilabuddy.example` or a single CloudFront domain with `/api` behavior.
- ACM certificate in `us-east-1` for CloudFront.
- No production user data copied into non-production.

---

## 15. CloudFormation specification

Use nested CloudFormation stacks or AWS SAM (which synthesizes CloudFormation). CDK is acceptable only if the team chooses it explicitly; generated CloudFormation remains reviewable.

### 15.1 Stack boundaries

1. **Foundation stack:** Route 53 references, KMS keys if customer-managed, shared artifact bucket, pipeline roles.
2. **Identity stack:** Cognito User Pool, domain, Google identity provider, app client, callback/logout URLs.
3. **Data stack:** DynamoDB tables, GSIs, TTL, PITR, backup policy, deletion protection in production.
4. **API stack:** API Gateway, JWT authorizer, Lambdas, layers/shared code, IAM roles, log groups, alarms, DLQs.
5. **Web stack:** Private S3 bucket, bucket policy, CloudFront distribution/OAC, WAF, response-header policies, DNS aliases.
6. **Notification stack:** SES identities/configuration set, EventBridge Scheduler group and roles, notification Lambda, delivery DLQ and alarms.
7. **Pipeline stack:** CodePipeline, CodeBuild projects, artifact stores, deployment roles, approvals.

### 15.2 Required infrastructure controls

- Parameterize environment, region, domain, log retention, alarm destinations, and Google secret ARN.
- Never place secret values in templates, parameters without `NoEcho`, build logs, or outputs.
- Use least-privilege IAM scoped to specific tables, indexes, schedules, buckets, and functions.
- Encrypt S3, DynamoDB, logs where supported, build artifacts, and pipeline artifacts.
- Enable versioning on deployment/artifact buckets.
- Set explicit CloudWatch LogGroup resources so retention survives predictable lifecycle behavior.
- Apply stack policies/deletion protection for production data resources.
- Use `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` for production DynamoDB tables and critical buckets; define a documented teardown procedure.
- Tag resources with application, environment, owner, cost-center if applicable, and data classification.
- Run CloudFormation linting and security scanning in CI.

---

## 16. CodePipeline and CodeBuild

### 16.1 Pipeline stages

1. **Source:** GitHub via CodeConnections (or CodeCommit if required). Trigger on protected main branch.
2. **Validate:** Install from lockfile; formatting check; lint; type-check; unit tests; dependency/license audit; secret scan; CloudFormation lint; IaC security scan.
3. **Build:** Build front end and Lambda artifacts once, create checksums and software bill of materials, publish immutable artifacts.
4. **Deploy dev:** CloudFormation change set, deploy, run migrations/reconciliation setup if any, upload web assets, invalidate HTML paths.
5. **Integration test:** API contract, Google-auth test strategy, authorization isolation, DynamoDB behavior, and notification tests using safe test recipients/mocks.
6. **Deploy staging:** Change set and automated end-to-end smoke tests on mobile viewport.
7. **Manual approval:** Required before production, showing change-set summary and test results.
8. **Deploy production:** CloudFormation change set, gradual Lambda deployment with alarms, web upload, CloudFront invalidation.
9. **Post-deploy verification:** Health checks and synthetic flows; automatically halt/rollback application version on alarm where safe.

### 16.2 Build separation and permissions

- Validation project has no production credentials.
- Build project may write only to the artifact bucket.
- Per-environment deploy role may operate only on that environment’s stacks/resources.
- Production deploy requires the production stage role and approval.
- Pull-request checks run outside or in a separate non-deploying pipeline.
- Builds are reproducible from a committed lockfile and pinned action/tool versions.

### 16.3 Deployment and rollback

- Lambda aliases and CodeDeploy canary deployment recommended for production.
- Front-end assets are content-addressed; keep prior releases for fast rollback.
- Database changes must be backward-compatible through the deployment window.
- CloudFormation changes use change sets; replacements of retained data resources require explicit approval.
- Rollback runbook identifies last known-good application artifacts and stack change set.

---

## 17. Security requirements and threat considerations

- Validate JWT issuer, audience, signature, expiration, and token use.
- Protect OAuth flow with state, nonce where applicable, and PKCE.
- Rate-limit invitations, membership changes, completion writes, history reads, and test emails using API Gateway/WAF/application controls.
- Validate all input with allowlists and length bounds; render user content as text.
- Use conditional writes to prevent duplicate points and invitation overuse.
- Prevent insecure direct object reference by authorizing every `groupId`, `userId`, `goalId`, and `invitationId` combination.
- Do not rely on hidden UI controls for authorization.
- Rotate secrets and support emergency revocation of Google/Cognito configuration.
- Dependency and container/package scans run in CI; critical findings block production.
- Backups and restore are tested, not merely enabled.
- A compromised invitation grants only the opportunity to request membership before expiry; it never exposes history without authenticated acceptance.
- Notification links open authenticated routes and contain no bearer token that grants group access.
- WAF managed rules and rate-based rules protect CloudFront/API entry points.

Key abuse cases to test:

- Guessing another group ID and requesting its week/history.
- Substituting another user ID in a history URL.
- Creating a completion for someone else or for a goal from another group.
- Double-tapping/replaying completion requests to inflate score.
- Racing invitation redemption past maximum use count.
- Continuing to access cached data after removal from a group.
- Causing duplicate reminder emails through scheduler retries.
- Using target `0` or an extreme target to break comparison calculations.

---

## 18. Analytics and product metrics

Collect the minimum events needed to improve the product:

- Sign-in completed.
- Group created/joined/left.
- Goal created/archived.
- Completion checked/unchecked, without goal name.
- Weekly target set.
- Daily/weekly notification enabled/disabled and delivery outcome.
- Week/history view opened.

Core metrics:

- Activation: joined/created a group, created at least one goal, and logged a completion within 24 hours.
- Weekly active loggers.
- Median days logged per active user.
- Four-week retention by activated cohort.
- Percentage of groups with two or more weekly active members.
- Reminder opt-in, click-through, unsubscribe, bounce, and complaint rate.
- Median time/taps to complete a Today logging session.

Do not optimize primarily for competition intensity or notification volume.

---

## 19. Acceptance criteria

### 19.1 Authentication and onboarding

- Given a new user, when Google authentication succeeds, then one Accountabilabuddy user is created and the user can create or join a group.
- Given a returning user, when they authenticate, then their group list and last-used group load without duplicate account creation.
- Before invitation acceptance, the user sees that full daily group history is visible to all group members.

### 19.2 Multiple independent groups

- A user can belong to at least three groups and switch among them.
- Goals, weekly target, completions, reminders, and comparison in Group A do not appear in Group B.
- A role in one group grants no permission in another.
- Leaving Group A does not alter membership or data in Group B.

### 19.3 Scoring

- Given “Run” has target frequency 2, when completed on four distinct dates in the same week, then it shows `4/2` and contributes four points.
- Repeating a PUT for the same user, group, goal, and date still contributes exactly one point.
- Two different goals checked on one day contribute two points.
- A completion beyond the weekly point target continues increasing the displayed score and may display progress above 100%.
- A future date and a date outside the goal’s active period are rejected.

### 19.3b Away days

- Marking a day Away clears that day’s completions across groups and rejects new check-offs for that date.
- Away may only be set for dates in the current Monday-start week; next week is rejected.
- With 3 Away days and goals 2/3/2 against a custom weekly target of 10, effective targets become 1/2/1 and weekly 7.
- Group week comparison and history show Away days for each member.
- Clearing Away does not restore previously cleared completions.

### 19.4 History and authorization

- A member can view another active member’s daily check-offs for every retained date in their shared group.
- The same viewer receives `404` or `403` for that person’s data in a group they do not share.
- A member can edit only their own check-offs; owners cannot edit other members’ check-offs.
- After removal or leaving, the former member cannot read group roster, comparison, or history even with a previously valid URL.

### 19.5 Friendly comparison and ties

- Equal progress and point values display the same tied position.
- No completion timestamp or other hidden value changes tied position.
- Comparison shows points and each member’s personal target.
- Over-target scores are displayed accurately.

### 19.6 Reminders

- Daily and weekly notifications are off until the user opts in.
- A daily reminder arrives at the configured local time within the documented delivery tolerance and links to the correct group.
- A weekly check-in summarizes the correct week, points, target, over-target goal counts, and tie status.
- Scheduler retry does not send a duplicate for the same scheduled occurrence.
- Disabling a preference, leaving a group, or account deletion prevents subsequent sends.
- DST transition preserves the selected local notification time.

### 19.7 Mobile and accessibility

- Core flows work at 320 CSS pixels wide without horizontal scrolling.
- A keyboard and common mobile screen reader can sign in, switch groups, check a goal, and inspect the week.
- Touch targets and color contrast meet stated accessibility requirements.
- A typical user can check three goals for today in no more than four deliberate taps after the Today screen loads.

### 19.8 Delivery

- A clean AWS account/environment can be deployed from CloudFormation without undocumented console-created application resources, except externally provisioned domain/Google prerequisites called out in setup.
- Main-branch pipeline runs validation, build, non-production deployment/tests, approval, and production deployment.
- A failed test blocks promotion; a failed deployment produces an alarm and documented rollback path.

---

## 20. Test strategy

### 20.1 Unit tests

- Week boundary calculation for every week-start option.
- Timezone and DST transitions.
- Score calculation with below-target, at-target, and over-target goal frequency.
- Progress above 100%.
- Tie-position assignment including `1, 2, 2, 4`.
- Goal active/archive date rules.
- Authorization policy functions.
- Reminder schedule and deduplication keys.
- Input validation and error mapping.

### 20.2 Integration tests

- Cognito JWT authorization using test keys/authorizer environment.
- Conditional completion writes under concurrent duplicate requests.
- Cross-group and cross-user access denial for every read/write route.
- Transactional invitation acceptance and ownership transfer.
- Weekly snapshot rebuild matches raw completions.
- EventBridge Scheduler target payload and IAM permissions.
- SES mocked delivery, retry, bounce suppression, and DLQ behavior.
- Pagination without missing or duplicating history entries.

### 20.3 End-to-end tests

- Google sign-in test account through onboarding.
- Create Group A and Group B, define different goals/targets, log in both, verify isolation.
- Invite a second user, accept disclosure, view each other’s full group-local history.
- Complete a 2x/week goal four times and verify four points everywhere.
- Create a tie and verify tied display.
- Configure, change, and disable both reminders.
- Remove a user and verify immediate loss of access.
- Run on representative iOS Safari and Android Chrome viewports.

### 20.4 Security and resilience tests

- OWASP ASVS-informed API and session checks.
- IDOR/property-based authorization tests across generated group/user IDs.
- WAF/rate-limit behavior.
- Dependency, secret, SAST, and IaC scans.
- Load test current-week reads and synchronized evening check-offs.
- Fault injection for SES failure, DynamoDB throttling, Lambda retry, and partial snapshot update.
- Backup restoration and score reconciliation exercise before production launch.

### 20.5 User testing

Test with at least five target users, including one screen-reader user if possible. Measure whether they can:

- Explain the point rule correctly.
- Understand that target frequency does not cap points.
- Identify which group they are logging in.
- Find another member’s day history.
- Interpret a tie and different personal targets.
- Turn each reminder on and off.

---

## 21. Tradeoffs and rationale

### Multiple independent groups vs. one global cohort

Group scoping adds membership and authorization complexity, but matches real social boundaries and prevents unrelated audiences from seeing one another. The system deliberately avoids a global score because different groups and goals are not directly comparable.

### Uncapped daily points vs. frequency-capped scoring

Uncapped daily points reward every positive day and make logging intuitive. The tradeoff is that someone can exceed a nominal frequency and lead by doing high-frequency habits. Showing both points and personal target progress makes that visible without inventing weights. Each goal still earns at most one point per day, limiting spam.

### Full history visibility vs. minimal disclosure

Full history creates stronger accountability and auditable totals, but it is more sensitive than sharing a weekly number. MVP mitigations are explicit pre-join disclosure, strict group isolation, authenticated access, no public profiles, and immediate access revocation. Per-goal privacy would complicate expectations and is deferred.

### Personal targets vs. uniform competition

Personal targets support different abilities and commitments, but percentages are not objective difficulty measures. The product labels the view as friendly progress comparison and shows raw points alongside targets.

### Ties vs. deterministic ranking

Allowing ties avoids rewarding arbitrary timing or technical details. Alphabetical ordering may stabilize rendering but never changes the shared position.

### Email reminders vs. push/SMS

Email works across mobile web without native permissions or telecom cost. It may be less immediate than push, but it keeps MVP infrastructure and consent understandable. Browser push can follow if engagement data justifies it.

### EventBridge schedules per membership vs. scanning preferences

Per-membership schedules correctly handle local time and DST with no periodic table scan and are simple at MVP scale. They increase resource count and update operations; a time-bucketed dispatcher is the documented scale path.

### DynamoDB vs. relational database

DynamoDB fits serverless traffic, conditional idempotent writes, and predictable group/week access patterns. It requires deliberate indexes and denormalized summaries. Completion records remain the source of truth so summaries can be repaired.

### PWA vs. native apps

A responsive PWA minimizes build and release overhead and supports the requested quick mobile workflow. Native push, deep OS integration, and app-store discovery are deferred.

---

## 22. Delivery phases

### Phase 0: Foundation

- Confirm brand/domain and AWS accounts.
- Configure Google OAuth consent/client and SES domain identity.
- Establish repository, CloudFormation structure, pipeline, environments, observability, and security baseline.

### Phase 1: Private alpha

- Google sign-in and profile.
- Multiple group creation/join/switching.
- Goals, personal target, Today logging, date backfill.
- Correct uncapped scoring and personal weekly view.
- Basic owner membership controls.

### Phase 2: Accountability MVP

- Group comparison, ties, complete daily member history.
- Invitation disclosure and authorization hardening.
- Daily reminders and weekly check-ins through SES/EventBridge Scheduler.
- Accessibility, performance, analytics, deletion, operational runbooks.

### Phase 3: Launch hardening

- Cross-browser end-to-end tests, load/security tests, backup restore.
- Canary deployment and rollback rehearsal.
- Small beta, feedback fixes, production readiness review.

---

## 23. Launch checklist

- Google OAuth consent screen and production redirect URIs approved.
- SES production access, SPF, DKIM, DMARC, bounce/complaint handling verified.
- Terms, privacy notice, history-visibility disclosure, and account deletion flow published.
- Production DynamoDB PITR, retention, alarms, deletion protection, and restore test verified.
- Cross-group authorization suite passes.
- Four-runs-equals-four-points scenario passes API, UI, history, snapshots, and weekly email tests.
- Tie behavior passes and contains no hidden tie-breaker.
- Daily and weekly opt-in, unsubscribe, DST, duplicate suppression, and inactive-membership tests pass.
- CloudFormation change sets and production rollback tested.
- Mobile accessibility and performance budgets pass.
- Support and incident-response ownership assigned.

---

## 24. Deferred decisions

These do not block MVP and should not alter the definitive decisions above:

- Whether members other than owners may invite by default after beta feedback.
- Exact retention period for deleted-account shared aggregates, subject to legal/privacy review.
- Whether history export is self-service at launch or initially handled through support.
- Whether users may copy a goal template between groups in a later release.
- Whether browser push adds enough value after email reminder usage is measured.
- Whether group owners may select Sunday rather than Monday as week start after initial creation; if editable, historical week boundaries must remain stable or be migrated explicitly.

---

## 25. Definition of MVP complete

MVP is complete when a new user can sign in with Google, participate in multiple isolated groups, define separate goals and weekly point targets in each, check goals for today or prior dates, earn one point for every distinct goal/day even beyond its weekly frequency, see accurate over-target progress, compare the week with tied positions, inspect every buddy’s full authorized daily history, and receive independently optional daily and weekly email prompts—all through an accessible mobile-first interface deployed by a tested CloudFormation/CodePipeline/CodeBuild path with server-side authorization, monitoring, backup, and rollback controls.
