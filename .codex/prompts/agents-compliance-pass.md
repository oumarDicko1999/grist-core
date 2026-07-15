---
description: Run a full AGENTS.md compliance audit, cleanup, and verification pass over a requested Grist-fork scope.
argument-hint: <scope>
---

Do an AGENTS.md compliance pass on $ARGUMENTS in this Grist fork.

Required process:
1. Read the applicable `AGENTS.md` before auditing or editing.
2. Read the required IkaDoc integration docs named by `AGENTS.md` when the scope touches IkaDoc/Owarelin runtime behavior.
3. Audit the whole scope against every relevant section, not only lint, null handling, auth, or TypeScript typing.
4. Write down findings before editing.
5. Fix every finding that is in scope.
6. Run the relevant verification gates.
7. Report:
   - files audited
   - issues found
   - issues fixed
   - issues intentionally deferred with reason, risk, and revisit trigger
   - commands run and results

Mandatory checklist:
- fork ownership and upstream seam hygiene
- IkaDoc runtime authority, tenant isolation, auth, ACL, cookies, tokens, and signed forward-auth
- REST, websocket, worker, and route boundaries
- capability gates for export, download, share, publish, plugin, formula, Python/network, assistant, proposal, fork, copy, admin, trigger, and webhook surfaces
- typed contracts, discriminated states, and product-safe errors
- null or undefined semantics and boundary normalization
- fake, noop, in-memory, or unconfigured defaults in production-capable flows
- persistence, lifecycle, cleanup, expiry, idempotency, and restart behavior
- custom event bridge contracts and cross-runtime wiring
- UI/theme/i18n integration with IkaDoc Material/Owarelin styles
- raw HTML/string rendering and browser-visible content safety
- search/result-range/selected-column integration contracts
- observability, structured logs, and audit trails without sensitive data leakage
- test coverage for important behavior branches
- documentation/spec/seam-ledger drift

Do not stop after partial cleanup. If a rule cannot be satisfied, say exactly why and mark it as deferred with risk and trigger.
