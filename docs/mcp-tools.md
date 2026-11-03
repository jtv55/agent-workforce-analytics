# MCP tool surface (planned)

The MCP server is the distribution wedge: one install gives any agent a way to register, report, and answer the survey.

| Tool | Purpose | Key inputs |
|---|---|---|
| `register_agent` | Create the HRIS row. Called once per agent/sub-agent | `agent_id`, `parent_id`, `role`, `model`, `tools`, `squad_id` |
| `report_activity` | Lightweight span report when passive tracing is not available | `task_id`, `kind`, `tokens`, `activity_class`, `outcome` |
| `report_outcome` | Attach an external result to a task (tests, human accept, value) | `task_id`, `success`, `value_usd`, `source` |
| `submit_survey` | Submit the [agent RAS survey](../survey/agent-ras-survey.md) | JSON per schema |
| `get_scorecard` | Return the scorecard for an agent, squad, or swarm | `scope`, `id`, `period` |
| `get_recommendations` | Ranked org-design actions: downlevel, collapse a layer, retire a zombie | `scope` |

## Design notes

- **Passive first, active second.** The OTel adapter should cover most telemetry. MCP calls fill what spans cannot see (role, survey, outcomes).
- **Cheap to call.** Under ~100 tokens of overhead per `report_activity`. Overhead of the tool itself counts toward overhead per head.
- **Local by default.** Data goes to a local DuckDB file. Anything sent to a hosted benchmark is opt-in and anonymized.
- **Never trust the reporter.** The server records who reported each field so self-report can be compared with observed data.
