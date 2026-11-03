# Live run dashboard

Local-first: the MCP server serves a page on `localhost` while a run is in progress. Hosted team views come later.

Every panel is scoped to a `run_id`.

## Panels

| Panel | Shows | Steering question |
|---|---|---|
| **Headcount** | Agents and sub-agents so far, ephemeral vs persistent, peak concurrency | How big is this getting? |
| **Org chart** | Live delegation tree, Mayor highlighted, span and layer counts, red for depth beyond threshold | Is the structure helping? |
| **Spend burn** | Cost so far, burn rate, **projected cost to finish**, budget line | Will I overspend? |
| **Cost breakdown** | By tier, agent, and tool; title-inflation flags | Where is money going, and is a big model doing small work? |
| **Activity mix** | Innovation / KTLO / coordination / rework, live | Is waste growing? |
| **Pareto** | Output share by agent, zombie list | Who is carrying the run? |
| **Stalls** | Rate-limit, quota, and outage time; idle agents | Am I blocked? |
| **Outcome** | Accepted deliverables, tests passing, cost per accepted outcome | Am I getting results for the spend? |
| **Survey feed** | Agent survey answers as they arrive, with self-report gaps flagged | What do the agents say, and do the data agree? |
| **Alerts** | Steering alerts, below | What should I do now? |

## Projected cost to finish

```
projected_total = spent_so_far + (remaining_work_units × recent_cost_per_work_unit)
```

`remaining_work_units` comes from the task plan (open tasks); `recent_cost_per_work_unit` is a trailing window so a recent improvement or regression is reflected. The panel shows a range (p25-p75), not a single number.

## Steering alerts (examples)

- An agent has retried more than N times in M minutes.
- A layer added over X% of cost and no accepted output.
- Projected total exceeds budget by more than Y%.
- Rework share rose over Z points in the last window.
- A large-tier agent is handling tasks that passed eval at a smaller tier.
- One agent (the Mayor) is on the critical path for over X% of tasks.
- Two agents have mutually conflicting instructions (from the survey feed).

Each alert states the evidence and the proposed action (downlevel, cap depth, retire, add a tool, raise a budget).

## Hand-off to the Run Story

When the run ends, the dashboard freezes and produces the [Run Story](run-story.md). The dashboard is for steering during the run, the story is for reflecting after it.
