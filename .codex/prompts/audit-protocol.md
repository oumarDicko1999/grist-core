---
description: Run the full AGENTS.md audit and issue-finding protocol over a requested Grist-fork scope.
argument-hint: <scope>
---

Run the AGENTS.md audit and issue-finding protocol on $ARGUMENTS in this Grist fork.

Required process:
1. Read the applicable `AGENTS.md` before auditing.
2. Read the required IkaDoc integration docs named by `AGENTS.md` when the scope touches IkaDoc/Owarelin runtime behavior.
3. First pass: map the relevant architecture, upstream seams, routes, websocket paths, services, stores, adapters, configuration, tests, docs, UI contracts, and API contracts.
4. Second pass: inspect every audit category from `AGENTS.md` one by one.
5. Third pass: re-check findings against nearby code and docs to remove false positives and add missing evidence.
6. Continue the loop while new issue categories are still being found.
7. Stop only when a full pass finds no new issue category, or when the remaining work requires runtime access, credentials, external systems, or a user decision.
8. Document the audit as it progresses when the audit is larger than a quick review.

Issue format:
- Issue: concise description of the problem.
- Evidence: file, route, config, test, or behavior that proves or strongly suggests the issue.
- Impact: what can break, leak, be lost, mislead operators, or hurt maintainability.
- Required fix: the smallest credible remediation or design decision.
- Tests needed: behavior, failure, permission, persistence, or contract tests that should catch regressions.
- Severity: blocker, high, medium, or low.

Audit categories:
- correctness bugs
- data loss and durability
- security
- tenant isolation
- concurrency and race conditions
- operational stability
- false positives
- API and contract drift
- observability and auditability
- performance and scale
- upgrade and migration
- testing gaps
- maintainability risks
- product and SaaS semantics

Do not hide caveats because they are out of current implementation scope. If an issue is intentionally deferred, document it as deferred with reason, risk, and the condition that should trigger revisiting it.
