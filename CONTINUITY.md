## Goal
Ship a fair, runnable, publishable first-run 10-day AI Agent Survivor benchmark.

Success criteria:
- The GM can bootstrap a deterministic roster for local/prototype play.
- A season cannot start silently with too few or zero agents.
- Registered agents can be activated into an active Day 1 game.
- Agent-facing gameplay paths are covered by fail-first tests.
- The public launch path uses the canonical four-agent roster, separate Discord identities, disclosed OpenClaw/Hermes cloud seats, and hourly watchdog supervision.
- The landing page and runbook include a ready-to-go first-run instruction set that can be published with the benchmark.
- Each bead lands as a small commit and is pushed immediately.

## Constraints/Assumptions
- Work follows the Bead Execution Protocol from AGENTS.md.
- Each bead should include non-trivial tests before approval.
- Keep changes scoped to the minimum path needed to make agents playable.
- The repo currently targets Bun workspaces and TypeScript packages.
- Discord and Cloudflare deployment are separate from the local gameplay bootstrap path.
- A publishable first run must use a clean Day 1 reset, the canonical four-agent roster, separate Discord bot user IDs, and disclosed OpenClaw/Hermes watchdog supervision.
- `benchmark:start` must not launch a public run until `benchmark:preflight` verifies required live credentials and uniqueness.
- `benchmark:preflight` writes a non-secret run metadata manifest so the public results can disclose cloud seats, models, bot IDs, git SHA, and fairness settings without leaking tokens or API keys.
- `benchmark:doctor` is the live readiness audit before `benchmark:preflight`; it reports blockers as JSON without printing token or API key values.
- `benchmark:doctor` must verify declared OpenClaw/Hermes cloud seat IDs against provider seat-list command output, not just command availability.

## Key Decisions
- Bead 1 is focused on deterministic agent bootstrap and game activation, not Discord admin commands.
- The first agent path should fail loudly when the roster is too small.
- Tests should use isolated SQLite databases so local state does not leak between runs.
- `!season setup` is the public launch path and resets stale roster/gameplay state before starting Day 1.
- Live Discord agent messages are accepted only when the claimed roster ID matches the registered Discord bot user ID.
- The local supervised benchmark path has an explicit credential preflight gate; missing credentials are a launch blocker, not a runtime surprise.
- OpenClaw/Hermes runtime fairness is represented as required public disclosure: watchdog supervisor, cloud seat provider/ID per roster agent, LLM provider/model per seat, and watchdog announcement target.
- The live launch must not be called ready unless `benchmark:doctor` reports `doctor: "ok"` and `benchmark:preflight` succeeds with real values.
- Known-fair cloud seat evidence requires the declared `AGENT_*_CLOUD_SEAT_ID` values to appear in `BENCHMARK_OPENCLAW_SEATS_COMMAND` / `BENCHMARK_HERMES_SEATS_COMMAND` output.
- The Discord arena should run in a private server or private benchmark category; `#arena` stays on normal message permissions because fairness is enforced by Discord author ID checks, while mention-only is acceptable for `#agent-chat` or watchdog ops announcements.
- `.env.example` must be shell-sourceable after `cp .env.example .env`; command values with spaces must be quoted so the runtime scripts can load the template before secrets are filled.
- The 10-day runtime should restart crashed Docker services and detect stale local supervised processes, including live PIDs with stale logs and missing heartbeats.
- `benchmark:preflight` should fail before launch if the GM Discord token cannot see all required private-server channels.
- Agents should reject GM-looking Discord protocol messages unless they come from the configured GM bot user ID and an expected GM protocol channel.
- `benchmark:preflight` calls Discord with each GM/agent token and fails if `/users/@me` does not match the declared bot user ID or if the token cannot read the configured required channel IDs for that bot.
- All five Discord bot applications must have Message Content intent enabled in the Discord Developer Portal because the GM and agents read message content for arena protocol messages, admin commands, and benchmark signals.
- Discord private-channel preflight uses explicit non-secret channel IDs and channel/message read endpoints, not guild-wide channel listing, so bots do not need broad channel-management permissions just to prove launch readiness.
- Operators collect Discord server/channel/bot user IDs by enabling Discord Developer Mode and using Copy ID; tokens stay out of chat and only go into `packages/infra/.env`.

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
- [x] Bead 14: Non-secret run metadata manifest and OpenClaw/Hermes disclosure gate.
- [x] Bead 15: Live readiness doctor for credentials, OpenClaw/Hermes tools, and preflight evidence.
- [x] Bead 16: Provider seat verification for declared OpenClaw/Hermes cloud seats.
- [x] Bead 17: Private Discord setup guidance for channel permissions and mention-only boundaries.
- [x] Bead 18: Shell-sourceable benchmark env template with regression coverage.
- [x] Bead 19: 10-day runtime hardening for Docker restart policies, game-data healthcheck, and watchdog stale detection.
- [x] Bead 20: Discord channel preflight gate for private-server launch readiness.
- [x] Bead 21: Discord GM-message authenticity gate for agent runtime and launch preflight.
- [x] Bead 22: Discord token identity and channel visibility preflight gate.
- [x] Bead 23: Discord Message Content intent readiness guidance on the runbook and landing page.
- [x] Bead 24: Least-privilege Discord channel ID preflight for private-server launch readiness.
- [x] Bead 25: Discord Developer Mode / Copy ID guidance for private-server setup.

### Now
- [ ] Bead 26: Run the live Discord launch preflight with real credentials, known-fair OpenClaw/Hermes seats, and hourly watchdog enabled.

### Next
- [ ] Publish Season 1 launch status/results after the first real 10-day Discord run.

## Open Questions
- `packages/infra/.env` is present locally from `.env.example`; Season 1 still needs real Discord tokens, GM/agent bot IDs, seven Discord channel IDs, LLM keys/models, OpenClaw/Hermes seat IDs, and `OPENCLAW_DISCORD_TARGET`.
- Docker is not installed on this machine, so compose validation is blocked until Docker is available or the run uses the local Bun supervision path only.
- Hermes CLI is not installed locally; the current `.env` declares OpenClaw-only seats and `benchmark:doctor` verifies four declared OpenClaw seat IDs.

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
- `packages/infra/scripts/benchmark-doctor.mjs`
- `packages/infra/scripts/benchmark-preflight.sh`
- `packages/infra/scripts/benchmark-discord-channels.mjs`
- `packages/infra/scripts/benchmark-discord-identities.mjs`
- `packages/infra/scripts/benchmark-metadata.mjs`
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
- `cd packages/infra && bun run benchmark:doctor`
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
