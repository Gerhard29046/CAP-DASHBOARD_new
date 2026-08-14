# Memory Index

- [Subagent report retrieval technique](technique_subagent_report_retrieval.md) — idle_notification has no content; read the subagent's persisted `.jsonl` transcript instead of re-spawning, especially for read-only agents with no Write tool.
- [E1 reliability fix paused 2026-08-14](project_e1_reliability_fix_paused.md) — implementation done+spot-checked, testing-bee/migration-audit-bee gate NOT run yet; also a real QA-script false-cleanup-PASS bug found (2 extra leftover accounts), not fixed/deleted.
