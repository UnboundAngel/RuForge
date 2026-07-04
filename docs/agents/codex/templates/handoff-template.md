# HANDOFF : <title>

## CONTEXT TYPE (critical)
- [ ] CONTEXT ONLY (do NOT generate anything)
- [ ] ACTIVE HANDOFF (next model must continue work)

If CONTEXT ONLY is checked:
-> Do not respond with a handoff
-> Do not restructure or summarize unless asked
-> Only acknowledge + store mentally

If ACTIVE HANDOFF is checked:
-> You must continue from “OPEN THREAD”
-> Do not restart system design
-> Do not re-explain completed architecture

---

## Date
<date>

## What this is
<2-4 sentences max. What happened, what system this belongs to, why it matters>

Rule: no restating project docs unless they changed

---

## What got COMPLETED
- <only concrete completed decisions or shipped work>

---

## What got STARTED (not finished)
- <what was begun>
- <current state>
- <what blocked completion>

---

## THE OPEN THREAD (single source of truth)
<ONLY one thing the next step depends on>

Format:
- Problem:
- Required next action:
- Hard constraint (if any):

If none:
-> "No open thread. Session complete."

---

## DECISIONS LOCKED
- <architecture or behavior decisions that must not be re-litigated>

---

## RISKS / CONSTRAINTS
- <what could break, conflict, or be misunderstood>

---

## IMPORTANT CONTEXT (non-redundant)
- Only include information NOT already in AGENTS.md / STATE.md / project docs
- If it exists elsewhere -> do not repeat it here

---

## GITHUB / STATE CHANGES
- commits:
- branches:
- releases:
- none:

---

## NEXT CHAT INSTRUCTION
- What the next model should do first
- Explicit “do not do” list (critical)

---

## SAFETY RULE
This is NOT a design document.
This is NOT a planning doc.
This is ONLY a continuation pointer.
