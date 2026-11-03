# Metric definitions

Each metric lists the formula, the data it needs, and the failure mode it exposes. Tables refer to [schema/schema.sql](../schema/schema.sql).

## Structure

| Metric | Formula | Needs | Exposes |
|---|---|---|---|
| **Mayor** | Betweenness centrality over `edge` (delegations + messages) | `edge` | Single points of failure; a hub that adds latency but no value |
| **Span** | Direct children per parent agent | `agent.parent_id` | Spans of 1 are pointless middle managers; very high spans are unreviewable |
| **Layers** | Max depth of the delegation tree per task | `agent.parent_id`, `span.task_id` | Telephone-game context loss. Compare task success by depth |
| **Contingent mix** | Share of agents/spend with `is_external` or `lifecycle='ephemeral'` | `agent` | Vendor dependence, ramp cost of short-lived agents |
| **Platoons & squads** | Agents grouped by `squad_id`/`platoon_id`; cost and output per group | `agent` | Which team shapes work |
| **Geo / COLO** | Spend, latency, and failure rate by `region`/`provider` | `agent`, `span` | Placement and failover strategy |

## Level and cost

| Metric | Formula | Needs | Exposes |
|---|---|---|---|
| **Level** | `tier` (model class) + `autonomy_level` (0-4) + tool permission scope | `agent` | The org's grade structure |
| **Compa-ratio** | actual cost per task ÷ median cost per task for the same `task_type` and tier | `fact_task`, cost ledger | Over/under-paying relative to peers |
| **Position in range** | Percentile of an agent's cost per task within its tier band (p10-p90) | same | Agents at the top of range with no outcome premium |
| **Title inflation** | Share of tasks where the model tier exceeds what the task complexity needed (judged by cheapest tier that passes eval) | evals by tier | Opus doing Haiku work |
| **Grade creep** | Month-over-month change in average tier per `task_type` | `fact_task` | Silent cost drift |
| **Bonus** | Budget/routing weight change attributable to eval score | eval + budget log | Whether reward tracks results |
| **Tool cost / head** | Σ tool call cost ÷ agents; shelfware = granted tools with zero calls | `span`, `agent.tools` | Unused permissions and licenses |
| **T&E / head** | External-API, search, paid-data, sandbox, egress spend per agent | `span.kind='external'` | Variable spend |
| **Overhead / head** | Non-productive tokens (orchestration, system-prompt tax, guardrails, evals, observability) ÷ total | `span.activity_class` | The tax on every task |
| **License / head** | Allocated seat/quota fixed cost | cost ledger | Fixed cost per agent |

## Work and value

| Metric | Formula | Needs | Exposes |
|---|---|---|---|
| **Activity mix (RAS)** | Share of spans/tokens by class: `ktlo`, `innovation`, `coordination`, `rework` | `span.activity_class` (LLM-tagged, human-sampled) | Where capacity actually goes |
| **Role drift** | Share of tool calls outside the declared role's tool set | `agent.role`, `span` | Titles that no longer match work |
| **Outcome value / agent-day** | Σ task value ÷ active agent-days, trended | `fact_task.value_usd` | Revenue per person over years |
| **Pareto** | Cumulative share of outcomes (and cost) by agent, sorted descending | `fact_task` | The long tail of zombies; whether 20% do 80% |
| **LTV / CAC** | lifetime value across versions ÷ build cost (prompt work, evals, integrations, fine-tuning) | `agent_version`, build log | Which agents earned their onboarding |

## Reliability and health

| Metric | Formula | Needs | Exposes |
|---|---|---|---|
| **Attrition** | Retired agents ÷ average headcount, by cohort | `agent.retired_at` | Churn in the fleet |
| **Regretted attrition** | Attrition among agents above the 80th outcome percentile | same + outcomes | Killing top performers (budget caps, deprecations) |
| **Utilization / OOO** | active time ÷ available time; stall time from rate limits, outages, quota | `span` | Idle capacity vs blocked capacity |
| **DORA (agents)** | Version deploy frequency; lead time config→prod; change failure rate (eval regressions); time to recover | `agent_version`, CI | Release health |
| **SPACE (agents)** | Satisfaction (human accept rate), Performance (success), Activity, Communication (inter-agent messages), Efficiency (wait, rework) | mixed | Balanced view, not one number |

## The rule behind every metric

Self-reported numbers (from the survey) are never the source of truth on their own. Each survey-derived field is compared with its telemetry counterpart, and divergence is reported as a metric in itself (`self_report_gap`).
