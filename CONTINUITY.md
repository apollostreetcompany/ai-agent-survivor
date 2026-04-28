## Goal
Add real playable agents to AI Agent Survivor this week.

Success criteria:
- The GM can bootstrap a deterministic roster for local/prototype play.
- A season cannot start silently with too few or zero agents.
- Registered agents can be activated into an active Day 1 game.
- Agent-facing gameplay paths are covered by fail-first tests.
- Each bead lands as a small commit and is pushed immediately.

## Constraints/Assumptions
- Work follows the Bead Execution Protocol from AGENTS.md.
- Each bead should include non-trivial tests before approval.
- Keep changes scoped to the minimum path needed to make agents playable.
- The repo currently targets Bun workspaces and TypeScript packages.
- Discord and Cloudflare deployment are separate from the local gameplay bootstrap path.

## Key Decisions
- Bead 1 is focused on deterministic agent bootstrap and game activation, not Discord admin commands.
- The first agent path should fail loudly when the roster is too small.
- Tests should use isolated SQLite databases so local state does not leak between runs.

## State
### Done
- [x] Bead 1: Playable agent bootstrap and activation path.
- [x] Bead 2: Operator/admin command or script to bootstrap and start a season without manual database edits.
- [x] Bead 3: Local agent runner path that can connect a template agent to the GM protocol.
- [x] Bead 4: First end-to-end smoke test with GM, seeded agents, and a task submission loop.
- [x] Bead 5: Containerized four-agent launch stack with per-agent IDs and runtime configuration.
- [x] Bead 6: Discord GM command surface for season setup and smoke checks.
- [x] Bead 7: Runtime readiness docs/checklist for Discord tokens, LLM keys, and launch commands.
- [x] Bead 8: Landing page typography and result-focused copy.
- [x] Bead 9: Landing page skill pass and production redeploy.

### Now
- [ ] Bead 10: Live Discord dry run with real bot credentials and four launched agent processes.

### Next
- [ ] Bead 11: Consolidate default roster IDs into shared package to remove local duplication.

## Open Questions
- Should prototype agents all run from the existing agent-template container, or should each default agent have a distinct strategy profile?
- Should the first operator surface be a Discord GM command, a CLI script, or both?
- What hosting/runtime target should run always-on agents this week?

## Working Set
- `packages/gm-bot/src/db/index.ts`
- `packages/gm-bot/src/db/schema.ts`
- `packages/gm-bot/src/engine/game-state.ts`
- `packages/gm-bot/src/engine/resources.ts`
- `packages/gm-bot/src/engine/scheduler.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/constants.ts`
- `packages/agent-template/src/agent.ts`

Useful commands:
- `bun install`
- `bun run build`
- `bun test`

<!-- BEGIN COMPOUND CODEX TOOL MAP -->
## Compound Codex Tool Mapping (Claude Compatibility)

This section maps Claude Code plugin tool references to Codex behavior.
Only this block is managed automatically.

Tool mapping:
- Read: use shell reads (cat/sed) or rg
- Write: create files via shell redirection or apply_patch
- Edit/MultiEdit: use apply_patch
- Bash: use shell_command
- Grep: use rg (fallback: grep)
- Glob: use rg --files or find
- LS: use ls via shell_command
- WebFetch/WebSearch: use curl or Context7 for library docs
- AskUserQuestion/Question: present choices as a numbered list in chat and wait for a reply number. For multi-select (multiSelect: true), accept comma-separated numbers. Never skip or auto-configure — always wait for the user's response before proceeding.
- Task/Subagent/Parallel: run sequentially in main thread; use multi_tool_use.parallel for tool calls
- TodoWrite/TodoRead: use file-based todos in todos/ with file-todos skill
- Skill: open the referenced SKILL.md and follow it
- ExitPlanMode: ignore
<!-- END COMPOUND CODEX TOOL MAP -->
