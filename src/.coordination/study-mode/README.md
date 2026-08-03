# Study Mode implementation memory

This directory is the durable source of truth for the Study Mode Orchestrator
vertical slice. A fresh coding session should read, in order:

1. `USER_INTENT.md`
2. `CURRENT_STATE.md`
3. `HANDOFF.md`
4. `NEXT_ACTIONS.md`
5. `FOUNDATION_STATUS.md`
6. `DECISIONS.md`
7. `OPPORTUNITY_CATALOGUE.md`

Implementation and documentation changes must remain inside `src/`.
Deferred ideas must not appear as controls until their shared data path and
recovery behavior are implemented.
