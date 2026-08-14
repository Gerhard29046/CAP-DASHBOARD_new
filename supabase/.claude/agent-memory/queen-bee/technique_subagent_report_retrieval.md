---
name: technique-subagent-report-retrieval
description: How to retrieve a spawned subagent's actual final report when it only sends an idle_notification with no content (esp. read-only agents with no Write tool, like migration-audit-bee)
metadata:
  type: project
---

When a spawned worker bee finishes, the only message that arrives in this session is a bare
`idle_notification` (`{"type":"idle_notification","from":"<name>",...}`) — it carries no report
content. Re-invoking `Agent` with the same `name`/`subagent_type` does NOT resume the original
agent's context; it spawns a brand-new, context-less instance (confirmed empirically — asking a
"continuation" this way just redoes the task from scratch, wasting a full run).

**For agents that write files** (`supabase-android-bee`, `android-ui-bee`, `testing-bee`): don't
bother retrieving their conversational report at all — just read `git diff`/`git status` and any
script/log files they created directly. That's the real, verifiable evidence anyway, per
[[feedback_verify_dont_trust_self_report]].

**For read-only agents with no Write tool** (`migration-audit-bee`): there is no disk artifact,
so the report text itself IS the deliverable. It can still be retrieved without re-running the
agent: every subagent's full transcript is persisted to disk at

```
<claude-projects-dir>/<project-slug>/<session-id>/subagents/agent-a<name>-<hash>.jsonl
```

e.g. `C:\Users\Gerhard\.claude\projects\C--Users-Gerhard-Documents-CAP-DASHBOARD-new\<session-id>\subagents\agent-a<name>-<hash>.jsonl`.

Find the right file with `find <dir> -newermt "<approx spawn time>" -type f` (filenames are
`agent-a<the name you gave Agent()>-<hash>.jsonl`), then read the last `"type":"assistant"` JSON
line in that file — its `message.content[0].text` is the agent's actual final report, verbatim.
`grep -n '"type":"assistant"'` to count/locate them; `tail -c N` or a JSON-line parse on the last
one gets the text (Windows Git Bash here has no `python3`/`jq` by default — plain `tail`/`grep`
on the raw JSONL works fine since the report text is one long escaped string on one line).

This means: if a read-only agent goes idle without visibly reporting, do NOT immediately
re-spawn it (wastes a full run and duplicate token cost) — check for its transcript file first.
