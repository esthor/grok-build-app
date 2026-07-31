# Grok Build interface reference

End-to-end map of every grok-build CLI / session surface that apps monitor or drive.
This is the **canonical field-level reference** for `packages/grok-harness`.

| | |
|---|---|
| **Upstream SOURCE_REV** | `8d69c91f02bcacf01e98d5aebbf2f92547c45738` |
| **Generated** | 2026-07-31 from `/Users/esthor/dev/tools/grok-build` |
| **Harness package** | `@grok-build-app/grok-harness` |
| **Verify** | `cd packages/grok-harness && bun run verify` |
| **Regenerate** | `GROK_BUILD_SRC=… bun run reference` |

Wire shapes change. After a grok-build upgrade: regenerate this file, update the package, re-run verify.

## Contents

1. [Layout on disk](#1-layout-on-disk)
2. [Path encoding](#2-path-encoding)
3. [events.jsonl](#3-eventsjsonl)
4. [updates.jsonl](#4-updatesjsonl)
5. [State files](#5-state-files)
6. [Leader socket](#6-leader-socket)
7. [Headless CLI](#7-headless-cli)
8. [Tools](#8-tools)
9. [Hooks](#9-hooks)
10. [ACP / x.ai methods](#10-acp--xai-methods)
11. [Semantics traps](#11-semantics-traps)
12. [Harness module map](#12-harness-module-map)

---

## 1. Layout on disk

Root: `$GROK_HOME` (default `~/.grok`, override env `GROK_HOME`).

### Home-level

| Path | Purpose |
|---|---|
| `active_sessions.json` | Live TUI sessions (array of `{session_id,pid,cwd,opened_at}`) |
| `active_sessions.lock` | Lock for active_sessions writes |
| `leader.sock` | Leader Unix domain socket |
| `leader.lock` | Leader singleton lock |
| `config.toml` | User config (hooks, models, permissions, …) |
| `pager.toml` | Pager/TUI config |
| `logs/unified.jsonl` | Unified log stream |
| `auth.json` | Auth material |
| `version.json` | Installed version metadata |
| `disabled-hooks` | One disabled hook name per line |
| `trusted-hook-projects` | Legacy project-hook trust |

### Session directory

`$GROK_HOME/sessions/<encode_cwd_dirname(cwd)>/<session_id>/`

| File / dir | Module | Role |
|---|---|---|
| `summary.json` | `state-files` | Identity, model, git, kind, title |
| `signals.json` | `state-files` | Cumulative counters (**can lag hours**) |
| `events.jsonl` | `events + tail` | Structured telemetry |
| `updates.jsonl` | `updates + tail` | Authoritative ACP + xAI transcript |
| `hunk_records.jsonl` | `state-files + tail` | Per-hunk LOC attribution |
| `chat_history.jsonl` | `—` | Derived chat cache |
| `rewind_points.jsonl` | `—` | Rewind markers |
| `plan.json / plan_mode.json` | `—` | Plan mode state |
| `goal/state.json` | `—` | Goal mode state |
| `announcement_state.json` | `—` | Announcements |
| `resources_state.json` | `—` | Resources |
| `system_prompt.txt` | `—` | Rendered system prompt |
| `prompt_context.json` | `—` | Structured prompt context |
| `compaction_checkpoints/` | `—` | Compacted history blobs |
| `images/` | `—` | Attached images |
| `subagents/` | `—` | Subagent metadata |

Long cwd dirs may contain a sibling `.cwd` marker file with the original absolute path.

---

## 2. Path encoding

**Source:** `xai-grok-config/src/paths.rs`

1. URL-encode the absolute cwd (`/Users/x/dev` → `%2FUsers%2Fx%2Fdev`).
2. If encoded length ≤ **255** bytes → use it (reversible via `decodeURIComponent`).
3. Else → `{slug}-{blake3_hex16}` and write `.cwd` with the original path.
4. Decode: URL-decode if absolute; else read `.cwd`.

Session id for path joins: UUID-shaped `[0-9a-fA-F-]{8,64}` only.

---

## 3. events.jsonl

**Source:** `xai-file-utils/src/events/types.rs` `Event`

```json
{"ts":"<RFC3339 ms UTC>","type":"<snake_case>", ...fields}
```

**57 event types:**

| `type` | Fields (snake_case wire) |
|---|---|
| `turn_started` | session_id, turn_number, model_id, yolo_mode, conversation_message_count, session_relationship, schema_version, turn, ption, redirect_kind |
| `phase_changed` | phase |
| `first_token` | — |
| `loop_started` | loop_index |
| `tool_started` | tool_name |
| `tool_completed` | tool_name, duration_ms, outcome, tring, tool_call_id, ource, source |
| `permission_requested` | tool_name |
| `permission_resolved` | tool_name, decision, wait_ms |
| `turn_ended` | outcome, ption, cancellation_category, ption, cancellation_context, serde_json |
| `interjected` | source, image_count, ind, redirect_kind |
| `yolo_toggled` | enabled |
| `goal_auto_paused` | reason |
| `todo_gate_fired` | fires, pending, in_progress, reason |
| `todo_gate_exhausted` | pending |
| `laziness_classifier_fired` | model_id, category, confidence |
| `laziness_nudge_fired` | model_id, category, nudges_remaining |
| `laziness_classifier_aborted` | reason |
| `goal_classifier_fired` | attempt, max_runs, model_id |
| `goal_classifier_verdict` | verdict, attempt, latency_ms |
| `goal_classifier_fail_open` | reason, attempt, latency_ms |
| `goal_classifier_fail_closed` | reason, attempt |
| `goal_classifier_cap_reached` | attempt |
| `goal_classifier_mid_turn_deferred` | pending_depth |
| `goal_classifier_dropped_after_cap` | attempts_seen |
| `goal_classifier_pending_queue_cleared` | dropped |
| `goal_planner_fired` | attempt, max_runs, model_id |
| `goal_planner_completed` | attempt, latency_ms |
| `goal_planner_fail_closed` | reason, attempt, latency_ms |
| `goal_strategist_fired` | attempt, consecutive_failures, every, model_id |
| `goal_strategist_completed` | attempt, consecutive_failures, latency_ms |
| `goal_strategist_failed` | reason, attempt, consecutive_failures, latency_ms |
| `goal_strategist_contract_restore_failed` | reason, attempt |
| `goal_summarizer_fired` | attempt, model_id |
| `goal_summarizer_completed` | attempt, latency_ms |
| `goal_summarizer_fail_open` | reason, attempt, latency_ms |
| `goal_role_model_resolved` | role, ption, skeptic_idx, model_id, agent_type, source |
| `goal_role_model_fail_open` | role, ption, skeptic_idx, reason |
| `goal_verifier_skeptic_verdict` | attempt, skeptic_idx, refuted, confidence, latency_ms |
| `goal_verifier_aggregate_verdict` | attempt, refuted_count, total, achieved |
| `goal_premature_stop_detected` | pattern |
| `mcp_config_resolved` | servers, disabled |
| `mcp_managed_config_result` | server_count, ption, error |
| `mcp_o_auth_discovery_timeout` | server_name, url |
| `mcp_server_starting` | server_name, transport, target, timeout_sec |
| `mcp_server_connected` | server_name, transport, tool_count, duration_ms, tools |
| `mcp_server_failed` | server_name, ption, transport, ption, target, error_type, error_message, ption, duration_ms, ption, timeout_sec |
| `mcp_tool_registration_failed` | server_name, tool_name, error |
| `mcp_init_completed` | total_servers, succeeded, failed, auth_required, total_tools, duration_ms, is_reinit, ec, failed_servers |
| `mcp_init_cancelled` | reason |
| `mcp_tool_call_started` | server_name, tool_name, call_id, timeout_sec |
| `mcp_tool_call_completed` | server_name, tool_name, call_id, duration_ms, success, is_timeout, ption, error, reconnect_attempted, auth_retry_attempted |
| `mcp_transport_error` | server_name, tool_name, error |
| `mcp_transport_decode_error` | server_name, error, sample |
| `mcp_transport_reconnect` | server_name, success, ption, error |
| `mcp_auth_retry` | server_name, trigger, success |
| `mcp_health_check` | server_name, healthy, ption, client_state |
| `mcp_server_toggled` | server_name, enabled |

### Nested enums

**Phase:** `waiting_for_model`, `streaming_text`, `streaming_reasoning`, `tool_execution`, `permission_prompt`

**ToolOutcome:** `success`, `error`, `permission_rejected`, `permission_cancelled`, `followup`, `hook_denied`, `invalid_tool`, `cancelled`

**PermissionDecision:** `allow`, `deny`, `cancelled`, `followup`

**TurnOutcomeLabel:** `completed`, `cancelled`, `error`

**SessionRelationship:** `primary`, `subagent`

**CancellationCategory:** `hook_denied`, `permission_rejected`, `permission_cancelled`, `mid_turn_abort`

**InterjectionSource:** `direct`, `queue`

**RedirectKind:** `interjection`, `cancel_then_send`, `queued_after_cancel`

### Harness parsing policy

- Primary types → dedicated `GrokEvent` arms.
- All `mcp_*` → `{ type: "mcp", subtype, fields }`.
- Goal / todo / laziness → `{ type: "orchestration", subtype, fields }`.
- Unknown → `{ type: "other", subtype, fields }`; torn lines → `null`.

---

## 4. updates.jsonl

### Envelope

```json
{
  "timestamp": <unix_secs>,
  "method": "session/update" | "_x.ai/session/update",
  "params": {
    "sessionId": "...",
    "update": { "sessionUpdate": "<kind>", ... },
    "_meta": { "eventId"?: number, "agentTimestampMs"?: number, "totalTokens"?: number }
  }
}
```

Tool meta: `params.update._meta["x.ai/tool"]`.

### ACP standard kinds

| `sessionUpdate` |
|---|
| `user_message_chunk` |
| `agent_message_chunk` |
| `agent_thought_chunk` |
| `tool_call` |
| `tool_call_update` |
| `plan` |
| `available_commands_update` |
| `current_mode_update` |

### xAI extension kinds (48 variants)

| `sessionUpdate` | Fields |
|---|---|
| `diff_review` | content |
| `retry_state` | (nested/tuple) |
| `auto_compact_started` | tokens_used, context_window, percentage, reason |
| `auto_compact_completed` | ption, tokens_before, tokens_after, ption, elapsed_ms, summary_preview |
| `auto_compact_failed` | error |
| `memory_flush_started` | — |
| `memory_flush_completed` | result, ption, path |
| `memory_dream_completed` | result, ption, path |
| `memory_session_saved` | path |
| `auto_compact_cancelled` | reason |
| `auto_continue_completed` | total_tokens |
| `feedback_request` | (nested/tuple) |
| `relay_sync_status` | (nested/tuple) |
| `auto_recovery_started` | attempt, max_retries, error, delay_ms |
| `auto_recovery_exhausted` | attempts, error |
| `hook_annotation` | message |
| `hook_execution` | event_name, ption, tool_name, ption, prompt_id, runs |
| `hooks_changed` | hooks, xai_hooks_plugins_types, project_trusted, ec, load_errors |
| `plugins_changed` | plugins, xai_hooks_plugins_types |
| `plugin_updates_installed` | updates |
| `session_summary_generated` | session_summary |
| `session_recap` | summary, auto |
| `session_recap_unavailable` | — |
| `compaction_checkpoint` | (nested/tuple) |
| `rewind_marker` | target_prompt_index, created_at |
| `task_completed` | task_snapshot, dvisory, will_wake |
| `subagent_spawned` | subagent_id, parent_session_id, ption, parent_prompt_id, child_session_id, subagent_type, description, bootstrap, ption, effective_context_source, std, ops, ot, context_normalized, ption, capability_mode, ption, persona, ption, role, ption, model, ption, resumed_from, ption, workflow_run_id |
| `subagent_progress` | subagent_id, parent_session_id, child_session_id, duration_ms, turn_count, tool_call_count, tokens_used, context_window_tokens, context_usage_pct, tools_used, error_count |
| `subagent_finished` | subagent_id, child_session_id, utcome, status, ption, error, tool_calls, turns, duration_ms, tokens_used, ption, output, dvisory, will_wake |
| `task_backgrounded` | tool_call_id, task_id, command, cwd, output_file, tasks, ption, monitor_description, ption, description |
| `scheduled_task_created` | task_id, prompt, human_schedule, next_fire_at |
| `scheduled_task_fired` | task_id, prompt, human_schedule, next_fire_at, ption, subagent_id |
| `scheduled_task_deleted` | task_id |
| `monitor_event` | task_id, description, event_text |
| `model_auto_switched` | previous_model_id, new_model_id, reason |
| `model_changed` | model_id, ption, reasoning_effort |
| `tool_call_delta_chunk` | ption, tool_call_id, tool_index, ption, name, ption, arguments_delta |
| `image_compressed` | images, message |
| `image_dropped` | notes |
| `memory_files` | files |
| `workflow_updated` | run_id, revision, name, objective, status, foreground, ec, phases, ption, current_phase, ption, agent_budget, agents_used, agents_reserved, ption, agents_remaining, agent_usage_incomplete, elapsed_ms, active_agents, ption, current_agent_label, ec, agents, ption, last_event, ption, last_event_detail, ption, last_event_timestamp, ption, pause_message, ption, result_summary |
| `goal_updated` | goal_id, objective, status, phase, ption, token_budget, tokens_used, elapsed_ms, total_deliverables, completed_deliverables, compat, ption, current_deliverable_id, ption, current_deliverable_title, ption, current_subagent_role, total_worker_rounds, total_verify_rounds, token_baseline, finished_subagent_tokens, ption, live_subagent_tokens, ec, live_tokens_by_model, ption, live_context_pct, ption, live_turn_count, ption, live_tool_call_count, ption, last_event, ption, last_event_detail, ption, last_event_timestamp, compat, ec, deliverables, nvariant, ption, pause_message, ption, classifier_runs_attempted, ption, classifier_max_runs, ption, last_classifier_verdict, ption, last_classifier_details_path, ption, verifying_completion, ption, planning |
| `pending_interaction` | tool_call_id, kind, crate, session, pending_interaction |
| `interaction_resolved` | tool_call_id |
| `turn_completed` | on, prompt_id, stop_reason, ption, agent_result, ption, usage |
| `response_started` | ption, message_id, ption, model, input_tokens, cache_read_input_tokens, cache_creation_input_tokens |
| `reasoning_completed` | ption, signature |
| `response_completed` | ption, message_id, ption, stop_reason, ption, usage, ption, signature, ption, stop_sequence |

### PromptUsage (`turn_completed.usage`) — camelCase

| Field | Notes |
|---|---|
| `inputTokens` | **FULL** — **includes** cache reads |
| `outputTokens`, `totalTokens`, `cachedReadTokens`, `reasoningTokens` | |
| `modelCalls`, `apiDurationMs` | |
| `costUsdTicks` | 1e10 ticks = $1; fail-closed |
| `costIsPartial`, `usageIsIncomplete` | omit if false |
| `modelUsage`, `numTurns` | |

Use `effectiveCostUsdTicks(usage)`.

---

## 5. State files

### active_sessions.json

Top-level **array**. Fields: `session_id`, `acp`, `pid`, `cwd`, `opened_at`

Always verify `pid` liveness.

### summary.json

| Field |
|---|
| `info` |
| `cwd_generation` |
| `ption` |
| `previous_cwd` |
| `ption` |
| `pending_cwd_switch_reminder` |
| `cwd_switch_bookkeeping_generation` |
| `session_summary` |
| `created_at` |
| `updated_at` |
| `num_messages` |
| `num_chat_messages` |
| `current_model_id` |
| `acp` |
| `ption` |
| `parent_session_id` |
| `ption` |
| `forked_at` |
| `ption` |
| `collection_id` |
| `next_trace_turn` |
| `version` |
| `chat_format_version` |
| `ption` |
| `prompt_display_cwd` |
| `session` |
| `ption` |
| `session_kind` |
| `bootstrapped` |
| `ption` |
| `fork_context_source` |
| `ption` |
| `fork_parent_prompt_id` |
| `ption` |
| `inherited_prefix_len` |
| `ption` |
| `hidden` |
| `ption` |
| `source_workspace_dir` |
| `ption` |
| `git_root_dir` |
| `ec` |
| `git_remotes` |
| `ption` |
| `head_commit` |
| `ption` |
| `head_branch` |
| `ption` |
| `request_id` |
| `ption` |
| `grok_home` |
| `ption` |
| `last_active_at` |
| `ption` |
| `generated_title` |
| `title_is_manual` |
| `ption` |
| `worktree_label` |
| `ption` |
| `agent_name` |
| `ption` |
| `sandbox_profile` |
| `ption` |
| `reasoning_effort` |

### signals.json

**camelCase**, can lag hours. Fields:

| Field |
|---|
| `turnCount` |
| `userMessageCount` |
| `assistantMessageCount` |
| `errorCount` |
| `toolFailureCount` |
| `cancellationCount` |
| `consecutiveCancellations` |
| `regenerationCount` |
| `hasReverted` |
| `compactionCount` |
| `totalTokensBeforeCompaction` |
| `contextWindowUsage` |
| `contextTokensUsed` |
| `contextWindowTokens` |
| `toolCallCount` |
| `toolsUsed` |
| `modelsUsed` |
| `primaryModelId` |
| `editAndRetryCount` |
| `bashBareEchoCount` |
| `gitCommitCount` |
| `prCreatedCount` |
| `prMergedCount` |
| `inferenceIdleTimeouts` |
| `doomLoopRecoveryAttempts` |
| `doomLoopRecoveryAcceptedAfterBudget` |
| `tailRepetition` |
| `doomLoopRecoveryTopTrigger` |
| `doomLoopRecoveryAbortedChunks` |
| `inferenceIdleTimeoutConfiguredSecs` |
| `gcsQueueEnqueued` |
| `gcsQueueUploaded` |
| `gcsQueueFailed` |
| `gcsQueueFallbacks` |
| `gcsQueueCircuitBreakerTrips` |
| `gcsQueuePending` |
| `gcsQueuePendingBytes` |
| `gcsQueueOrphansCleaned` |
| `positiveRatings` |
| `negativeRatings` |
| `longPausesCount` |
| `sessionDurationSeconds` |
| `avgTimeToFirstTokenMs` |
| `avgResponseTimeMs` |
| `minTimeToFirstTokenMs` |
| `maxTimeToFirstTokenMs` |
| `latencySampleCount` |
| `itlP50Ms` |
| `itlP99Ms` |
| `itlMaxMs` |
| `exact` |
| `itlMeanMs` |
| `totalChunkCount` |
| `itlSampleCount` |
| `agentLinesAdded` |
| `agentLinesRemoved` |
| `agentLinesAddedReverted` |
| `agentLinesRemovedReverted` |
| `humanLinesAdded` |
| `humanLinesRemoved` |
| `humanLinesAddedReverted` |
| `humanLinesRemovedReverted` |
| `agentFilesTouched` |
| `humanFilesTouched` |
| `totalFilesTouched` |
| `itlDigest` |
| `itlSumMs` |
| `itlIntervalCount` |
| `peakRssBytes` |

### hunk_records.jsonl

Keep **latest** per `hunkId`. camelCase: `hunkId`, `filePath`, `hunkStart`, `hunkEnd`, `linesAdded`, `linesRemoved`, `authorType`, `authorId`, `agentId`, `sessionId`, `timestamp`, `promptIndex`, `sourceType`, `eventType`, `removalReason`.

---

## 6. Leader socket

| | |
|---|---|
| Socket | `$GROK_HOME/leader.sock` (`$GROK_LEADER_SOCKET`) |
| Framing | u32 **big-endian** length + JSON |
| Max | 64 MiB |
| Version | 1 |

### ClientMessage / ServerMessage

| Client type | Fields |
|---|---|
| `register` | client_type, mode, capabilities |
| `acp` | payload |
| `control` | request_id, command |
| `ping` | — |
| `disconnect` | — |

| Server type | Fields |
|---|---|
| `registered` | client_id, ready, leader_protocol_version, leader_binary_version, leader_capabilities |
| `acp` | payload |
| `control_result` | request_id, result |
| `pong` | — |
| `error` | code, message |
| `shutting_down` | reason, elf, delay_ms |
| `shutdown` | — |
| `leader_ready` | — |

**ClientCapabilities:** `ode`, `yolo_mode`, `ode`, `auto_mode`, `default_model`, `client_version`, `nabled`, `code_nav_enabled`, `erminal`, `terminal`, `terminal`, `terminal`, `fs_read`, `fs_write`

**ControlCommand:** `get_leader_info`, `cpu_profile_status`, `start_cpu_profile`, `stop_cpu_profile`, `workspace_start`, `workspace_pause`, `workspace_resume`, `workspace_stop`, `workspace_status`, `relaunch_for_update`

**ControlPayload:** `leader_info`, `cpu_profile_status`, `cpu_profile_started`, `cpu_profile_stopped`, `workspace_status`, `relaunching`, `relaunch_declined`

**ShutdownReason:** `auto_update`, `idle_timeout`, `manual`

Notifications may use `_x.ai/...` with nested params — use `canonicalMethod` / `methodsEqual`.

### Roster

| Method | Payload |
|---|---|
| `x.ai/sessions/list` | `{ sessions: RosterEntry[] }` |
| `x.ai/sessions/changed` | `{ upserted, removed }` |

**RosterEntry:** `sessionId`, `title`, `cwd`, `isWorktree`, `modelId`, `ption`, `reasoningEffort`, `yolo`, `activity`, `resident`, `lastChangeUnixMs`, `origin`

**Activity:** `working`, `idle`, `needs_input`, `dormant`, `completed`, `dead`

---

## 7. Headless CLI

### streaming-json types

| type |
|---|
| `error` |

### Final json result

| Field | Notes |
|---|---|
| `usage.input_tokens` | **UNCACHED** (opposite of updates.jsonl) |
| `usage.cache_read_input_tokens`, `output_tokens`, `reasoning_tokens`, `total_tokens` | |
| `num_turns`, `usage_is_incomplete`, `cost_is_partial` | |
| `total_cost_usd_ticks`, `total_cost_usd`, `modelUsage` | fail-closed ticks |

---

## 8. Tools

**39 built-ins:**

| Name |
|---|
| `read_file` |
| `write` |
| `search_replace` |
| `edit_notebook` |
| `delete_file` |
| `run_terminal_cmd` |
| `run_terminal_command` |
| `get_task_output` |
| `get_command_or_subagent_output` |
| `get_terminal_command_output` |
| `kill_task` |
| `kill_command_or_subagent` |
| `kill_terminal_command` |
| `wait_commands_or_subagents` |
| `grep` |
| `glob` |
| `list_dir` |
| `skill` |
| `ask_user_question` |
| `enter_plan_mode` |
| `exit_plan_mode` |
| `todo_write` |
| `task` |
| `spawn_subagent` |
| `web_search` |
| `web_fetch` |
| `lsp` |
| `image_gen` |
| `image_edit` |
| `video_gen` |
| `image_to_video` |
| `reference_to_video` |
| `monitor` |
| `scheduler_create` |
| `scheduler_delete` |
| `scheduler_list` |
| `search_tool` |
| `use_tool` |
| `update_goal` |

MCP: `server__tool`. Meta key: `x.ai/tool`. Schema: `schema/tool_meta.schema.json`.

---

## 9. Hooks

| name |
|---|
| `session_start` |
| `user_prompt_submit` |
| `pre_tool_use` |
| `post_tool_use` |
| `post_tool_use_failure` |
| `permission_denied` |
| `stop` |
| `stop_failure` |
| `notification` |
| `subagent_start` |
| `subagent_stop` |
| `pre_compact` |
| `post_compact` |
| `session_end` |

Config: `{ "<event>": [ { matcher?, hooks: [{ type, command?, url?, timeout?, env? }] } ] }`.
Client methods: `x.ai/hooks/run` (gate), `x.ai/hooks/event` (observe).

---

## 10. ACP / x.ai methods

100 methods observed in agent routers:

| Method |
|---|
| `x.ai/auth/` |
| `x.ai/auto-topup-rule` |
| `x.ai/billing` |
| `x.ai/btw` |
| `x.ai/bundle/` |
| `x.ai/capabilities` |
| `x.ai/cloud/env/create` |
| `x.ai/cloud/env/delete` |
| `x.ai/cloud/env/list` |
| `x.ai/cloud/env/update` |
| `x.ai/cloud/terminate` |
| `x.ai/code/` |
| `x.ai/commands/list` |
| `x.ai/compact_conversation` |
| `x.ai/debug/` |
| `x.ai/display_cwd` |
| `x.ai/feedback` |
| `x.ai/feedback/dismiss` |
| `x.ai/fs_notify` |
| `x.ai/getApiKey` |
| `x.ai/git/` |
| `x.ai/git/worktree/` |
| `x.ai/hooks` |
| `x.ai/hooks/` |
| `x.ai/hunk-tracker/` |
| `x.ai/interject` |
| `x.ai/internal/auth_cleared` |
| `x.ai/internal/evict_sessions` |
| `x.ai/internal/reload_all_mcp_servers` |
| `x.ai/internal/reload_models` |
| `x.ai/internal/reload_models_cache` |
| `x.ai/internal/reload_project_mcp_servers` |
| `x.ai/internal/reload_skills` |
| `x.ai/internal/reload_workflows` |
| `x.ai/leaderClientId` |
| `x.ai/marketplace/` |
| `x.ai/memory/flush` |
| `x.ai/memory/rewrite` |
| `x.ai/permissions/reset` |
| `x.ai/persist` |
| `x.ai/plugins/` |
| `x.ai/plugins/reload` |
| `x.ai/pr/` |
| `x.ai/privacy/setCodingDataRetention` |
| `x.ai/prompt_history` |
| `x.ai/queue/clear` |
| `x.ai/queue/edit` |
| `x.ai/queue/interject` |
| `x.ai/queue/remove` |
| `x.ai/queue/reorder` |
| `x.ai/recap` |
| `x.ai/restore_code` |
| `x.ai/review` |
| `x.ai/rewind` |
| `x.ai/rollout/survey` |
| `x.ai/runningPromptId` |
| `x.ai/scheduler/` |
| `x.ai/search/` |
| `x.ai/session/add_local_workspace` |
| `x.ai/session/close` |
| `x.ai/session/delete` |
| `x.ai/session/fork` |
| `x.ai/session/import` |
| `x.ai/session/info` |
| `x.ai/session/list` |
| `x.ai/session/load_history` |
| `x.ai/session/prompt_complete` |
| `x.ai/session/rehydrate` |
| `x.ai/session/rename` |
| `x.ai/session/repair` |
| `x.ai/session/resolve_local_for_worktree_resume` |
| `x.ai/session/search` |
| `x.ai/session/state` |
| `x.ai/session/update_mcp_servers` |
| `x.ai/session/updates` |
| `x.ai/session/usage` |
| `x.ai/session_summaries/` |
| `x.ai/session_summaries/session_list` |
| `x.ai/session_summaries/workspace_list` |
| `x.ai/session_summaries/workspace_list_recent` |
| `x.ai/sessions/list` |
| `x.ai/setApiKey` |
| `x.ai/share_session` |
| `x.ai/skills/` |
| `x.ai/skills/refresh-baseline` |
| `x.ai/skip_envrc` |
| `x.ai/subagent/` |
| `x.ai/suggest` |
| `x.ai/suggestPrompt` |
| `x.ai/task/` |
| `x.ai/telemetry/multi_agent_apply` |
| `x.ai/telemetry/multi_agent_discard` |
| `x.ai/telemetry/multi_agent_followup` |
| `x.ai/telemetry/non_git_decision` |
| `x.ai/terminal/` |
| `x.ai/terminal/pty/input` |
| `x.ai/toggle_plan_mode` |
| `x.ai/workflows/list` |
| `x.ai/workspaces/list` |
| `x.ai/yolo_mode_changed` |

---

## 11. Semantics traps

| Trap | Rule |
|---|---|
| Dual inputTokens | updates includes cache; headless excludes |
| Cost | absent/incomplete/partial ⇒ UNKNOWN, never $0 |
| `_meta.totalTokens` | occupancy not spend; drops on compaction |
| signals.json | lag hours — seed only |
| phase_changed | ~90% of events — debounce |
| Subagents | session_kind starts with subagent |
| Terminal tools | both run_terminal_cmd and run_terminal_command |
| Atomic JSON | re-open by path; JSONL may tear |
| Roster notifs | may be `_x.ai/sessions/changed` |

---

## 12. Harness module map

| Module | File | Responsibility |
|---|---|---|
| `events` | `src/events.ts` | Full events.jsonl vocabulary + nested enums |
| `headless` | `src/headless.ts` | streaming-json + final json result |
| `hooks` | `src/hooks.ts` | Hook events, aliases, config, envelope, gate |
| `json` | `src/json.ts` | Tolerant JSON helpers (never throw on torn lines) |
| `leader` | `src/leader.ts` | Socket framing, control, roster parse |
| `methods` | `src/methods.ts` | ACP + x.ai/* method constants |
| `paths` | `src/paths.ts` | $GROK_HOME, SESSION_FILES, HOME_FILES, cwd encode/decode, .cwd marker |
| `state-files` | `src/state-files.ts` | active_sessions, summary, signals, hunk_records |
| `tail` | `src/tail.ts` | Byte-offset JSONL tailer (short-read + UTF-8 safe) |
| `tools` | `src/tools.ts` | BUILTIN_TOOL_NAMES + CanonicalToolMeta |
| `updates` | `src/updates.ts` | updates.jsonl envelope, all kinds, usage/cost/tool/subagent/task accessors |

Also: `schema/catalog.json` (machine-readable constants), `schema/tool_meta.schema.json`.

---

*Generated from `/Users/esthor/dev/tools/grok-build` @ `8d69c91f02bcacf01e98d5aebbf2f92547c45738`. Unofficial mirror of grok-build interfaces.*
