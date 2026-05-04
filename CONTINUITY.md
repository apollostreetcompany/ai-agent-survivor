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
- A publishable first run must use a clean Day 1 reset, the canonical four-agent roster, separate Discord bot user IDs, and disclosed OpenClaw/Hermes watchdog supervision.
- `benchmark:start` must not launch a public run until `benchmark:preflight` verifies required live credentials and uniqueness.

## Key Decisions
- Bead 1 is focused on deterministic agent bootstrap and game activation, not Discord admin commands.
- The first agent path should fail loudly when the roster is too small.
- Tests should use isolated SQLite databases so local state does not leak between runs.
- `!season setup` is the public launch path and resets stale roster/gameplay state before starting Day 1.
- Live Discord agent messages are accepted only when the claimed roster ID matches the registered Discord bot user ID.
- The local supervised benchmark path has an explicit credential preflight gate; missing credentials are a launch blocker, not a runtime surprise.

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
- [x] Bead 10: Full landing page skill audit pass and production redeploy.
- [x] Bead 11: Runnable Discord benchmark MVP with four agents, persistent ops state, local Mac supervision, and watchdog monitoring.
- [x] Bead 12: Shared canonical roster with fresh fair setup, Discord identity checks, and publishable first-run instructions.
- [x] Bead 13: Launch credential preflight gate for known-fair Discord/OpenClaw runs.

### Now
- [ ] Bead 14: Run the live Discord launch preflight with real credentials and OpenClaw hourly watchdog enabled.

### Next
- [ ] Publish Season 1 launch status/results after the first real 10-day Discord run.

## Open Questions
- Should Bead 14 install the OpenClaw cron against `#gm-admin` or a dedicated ops Discord channel?
- Which exact OpenClaw/Hermes cloud agents and provider/model IDs should be disclosed for each roster seat before Season 1 starts?

## Working Set
- `packages/gm-bot/src/db/index.ts`
- `packages/gm-bot/src/db/schema.ts`
- `packages/gm-bot/src/engine/game-state.ts`
- `packages/gm-bot/src/engine/resources.ts`
- `packages/gm-bot/src/engine/scheduler.ts`
- `packages/gm-bot/src/engine/roster.ts`
- `packages/gm-bot/src/discord/events/message-handler.ts`
- `packages/gm-bot/src/cli/season.ts`
- `packages/gm-bot/src/ops/runtime.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/default-roster.json`
- `packages/agent-template/src/agent.ts`
- `packages/agent-template/src/local-runner.ts`
- `packages/infra/scripts/benchmark-start.sh`
- `packages/infra/scripts/benchmark-preflight.sh`
- `packages/infra/scripts/benchmark-watchdog.sh`
- `packages/infra/scripts/benchmark-common.sh`
- `packages/infra/RUNBOOK.md`
- `docs/index.html`
- `docs/styles.css`

Useful commands:
- `bun install`
- `bun run build`
- `bun test`
- `bun run test`
- `bun --filter @survivor/gm-bot test`
- `bun --filter @survivor/agent-template test`
- `bun --filter @survivor/infra test`
- `cd packages/infra && bun run benchmark:preflight`
- `cd packages/infra && bun run benchmark:start`
- `cd packages/infra && bun run benchmark:status`
- `cd packages/infra && bun run benchmark:watchdog`

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
