---
name: feedback-dont-narrow-delete-everything-scope
description: When a user asks to delete/empty "everything" or reset to a blank state, don't unilaterally exclude a category based on your own judgment call — ask, or default broad and let them opt out
metadata:
  type: feedback
---

When the user asked to delete "all the customer data and machines and services and jobs" for a
full from-scratch test, I proposed a scope that explicitly excluded Knowledge Base data,
reasoning it was "product reference data, not customer data." The user's actual intent was a
genuinely empty database for testing — they corrected me afterward ("you didn't delete the
knowledge base data"). Turned out the KB tables were already empty, but the `documents` Storage
bucket had an orphaned file I'd have left behind under my original (too-narrow) scope proposal.

**Why**: my own categorization judgment ("KB is reference data, not customer data") was a
reasonable-sounding but unrequested narrowing of what the user actually meant by "empty
database" / "full test from beginning." The user had to notice the gap and correct it themselves
after the fact, rather than me surfacing the ambiguity up front.

**How to apply**: for any "delete everything" / "start fresh" / "empty the database" style
request, either (a) explicitly list every plausible category as an item to confirm/opt out of in
the up-front scope proposal (which I did do for storage buckets and client_imports — the miss was
specifically not listing knowledge base as an option at all), or (b) default to the broadest
reasonable interpretation and let the user narrow it down, rather than silently narrowing it
myself and only surfacing the exclusion as a fait accompli. Still always get explicit confirmation
before executing anything destructive — this doesn't relax that requirement, it's about what to
put in front of the user to confirm. See [[technique_supabase_synthetic_field_contamination]] for
an unrelated technique from the same session, and the 2026-08-17 DECISIONS.md entries for the
full incident.
