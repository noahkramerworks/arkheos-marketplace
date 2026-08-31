# Compatibility and migration

Production migrates the existing `fixed-production` Worker, D1 database, `fixed-production-config` KV namespace, and `fixed-artifacts` R2 bucket in place. Physical names remain legacy throughout the 0.1.x package line; semantic records use `arkheos.*` schemas.

Plugin version 0.1.1 contains the source of deployed Worker version `f546708b-49eb-492b-95c5-2ec107590dd3`. The account host fetches extensionless `/account` for `/`, `/account`, `/device`, and `/welcome`, preventing Cloudflare Static Assets from canonicalizing an explicit `/account.html` request back into the worker route. Service deployment and plugin publication remain separate effects, so the live service and `service/package.json` retain their 0.1.0 API identity until a separately planned service release.

`0001_initial.sql` is the exact deployed legacy schema. `0002_arkheos_membership.sql` is additive. It must work both against the currently empty production tables and against a nonempty legacy fixture. The live Codex, Fixed. 1.0.1 release remains readable until a separately recorded promotion supersedes it.

The registered but uninstalled `codex-fixed@personal` package and its recovered workspace are never edited or deleted. Legacy USD 5 card-backed-trial assumptions do not enter current catalog, entitlement, checkout, Skills, or customer copy.

Observed build surfaces differ: CLI `0.149.0` and desktop runtime `0.150.0-alpha.12.2`. Record the actual build at every install and fresh-task test. Public product documentation does not override installed contracts or controlled observations.
