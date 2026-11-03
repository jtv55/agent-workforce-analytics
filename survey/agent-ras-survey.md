# Agent RAS Survey

A structured survey completed by each agent and sub-agent at the end of a task or on a schedule. It is the agent equivalent of the activity study (RAS) and engagement survey.

## Rules

- **Structured output only.** Answers are returned as JSON matching the schema below, via the `submit_survey` MCP tool.
- **Self-report is one input, not the truth.** Each answer is compared with telemetry. Divergence is recorded as `self_report_gap`.
- **Ask for the work, not the persona.** Questions ask what the agent did, not what a "good employee" would say.
- **Hard goals.** The final section asks for a specific, ambitious, measurable goal for the next period.
- **Short.** Target under 600 output tokens per response so the survey stays cheap enough to run on every sub-agent.

## Sections

### 1. Role and responsibilities
1. In one sentence, what were you asked to do?
2. What did you actually spend most of your effort on?
3. List tool calls or tasks you did that fall outside your declared role.
4. Who (agent, human, system) was accountable for the result? Who did you depend on?

### 2. Activity allocation
Percent of effort across (must sum to 100):
- `ktlo`: retries, error recovery, re-authentication, rebuilding context, keeping things running
- `innovation`: net-new output that did not exist before
- `coordination`: waiting on, briefing, or reconciling with other agents or humans
- `rework`: redoing work because earlier output was wrong or unclear

### 3. Level and fit
5. Was this task beneath, at, or above your capability? (`under` / `fit` / `over`)
6. Would a cheaper/smaller model have done it as well? (`yes` / `no` / `unsure`) and why.
7. Would a more capable model have changed the result? (`yes` / `no` / `unsure`) and why.

### 4. Context and tools
8. Rate context sufficiency 1-5. What was missing?
9. Tools you had but did not use. Tools you needed and lacked.
10. Instructions that were ambiguous, conflicting, or stale.

### 5. Structure
11. Was the delegation depth above you helpful? (`helpful` / `neutral` / `added_loss`)
12. Which upstream or downstream agent most affected your output, positively or negatively?
13. Would you have done better with a different team shape (fewer layers, a peer, a reviewer)?

### 6. Health
14. Time lost to rate limits, timeouts, or quota (estimate, minutes).
15. Confidence in your own result, 0-100, and the single check that would raise it. (Compared against external eval outcome to measure calibration.)

### 7. Goal
16. State one specific, measurable, ambitious goal for your next task or period, and the first change that would make it reachable.

## Response schema

```json
{
  "agent_id": "string",
  "task_id": "string",
  "role_summary": "string",
  "actual_focus": "string",
  "out_of_role_actions": ["string"],
  "accountable": "string",
  "depends_on": ["string"],
  "activity_pct": { "ktlo": 0, "innovation": 0, "coordination": 0, "rework": 0 },
  "level_fit": "under|fit|over",
  "cheaper_model_ok": "yes|no|unsure",
  "cheaper_model_why": "string",
  "stronger_model_helps": "yes|no|unsure",
  "context_score": 1,
  "context_missing": "string",
  "unused_tools": ["string"],
  "missing_tools": ["string"],
  "bad_instructions": ["string"],
  "depth_effect": "helpful|neutral|added_loss",
  "most_influential_peer": "string",
  "better_team_shape": "string",
  "minutes_lost_to_limits": 0,
  "confidence_pct": 0,
  "check_that_would_raise_confidence": "string",
  "next_goal": "string",
  "first_change": "string"
}
```

## Cross-checks

| Survey field | Telemetry counterpart | Derived metric |
|---|---|---|
| `activity_pct.ktlo` | share of spans tagged `ktlo` | `self_report_gap_ktlo` |
| `out_of_role_actions` | tool calls outside role tool set | `role_drift_gap` |
| `minutes_lost_to_limits` | stall time from 429/timeouts | `stall_gap` |
| `confidence_pct` | eval pass/fail | calibration error |
| `unused_tools` | tools with zero calls | shelfware confirmation |
| `cheaper_model_ok` | eval result at lower tier | title-inflation confirmation |
