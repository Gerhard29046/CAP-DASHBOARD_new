---
name: technique-zero-byte-junk-file-source
description: Recurring zero-byte junk files in the repo root/working tree are shell-redirection artifacts from inline multi-line commands (python3 -c, node -e, printf) whose printed text contains unescaped shell metacharacters like ( ) , + — confirmed source, not just a recurring mystery. Check `git status --short` after any such command.
metadata:
  type: technique
---

This project has repeatedly found stray zero-byte files sitting in the working tree with names
like `frontend/0)`, `r.status`, `,+`, `Job`, `(u.email`, `Appearance` — documented as a "recurring
pattern" across several `KNOWN_ISSUES.md` entries but previously logged as an unexplained
mystery ("almost certainly a shell-quoting accident").

**Confirmed root cause, 2026-08-16/17**: running a `Bash` command whose output text contains
unescaped `(` `)` `,` `+` or similar shell-significant characters — e.g. a `python3 -c "..."`
script that `print()`s a string containing those characters, or a long commit-message heredoc
with the same — can get the surrounding shell to interpret fragments of that printed text as
redirection/subshell syntax, creating literal files named after the fragment. This happened
multiple times in a single session from a `python3 -c` call whose printed JSON content included
things like `,+`, `(u.email`, `0)env[t.slice(0`.

**How to apply**: after any Bash command that prints a large/uncontrolled string (JSON dumps,
diff excerpts, agent transcript text, commit message previews) — especially one written by
another agent whose exact output you didn't author — run `git status --short --untracked-files=all`
immediately after and check for new zero-byte or oddly-named untracked files before assuming the
tree is clean. Verify each is genuinely zero bytes (`ls -la`) before deleting, but don't leave
them sitting around either — they've been found and cleaned up 3+ separate times in this project
without ever being investigated until now, which wastes the next session's attention.

Longer-term fix, not yet done: prefer writing such scripts to a temp `.py`/`.mjs` file and
running `python3 tmpfile.py` instead of `-c "..."` when the content is long/complex/contains
special characters, or pipe through `python3 -c "..." > /tmp/out.txt 2>&1` explicitly rather than
relying on the tool's own capture.
