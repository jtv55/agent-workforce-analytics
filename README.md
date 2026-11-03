# Agent Workforce Analytics

**A benchmark, live dashboard, and retrospective for agent swarms.** People now ship an epic in a day with AI, then start the next one, and nobody reflects on what happened. This tool treats the agents that did the work as a workforce, grades them on the people-analytics battery (the mayor, spans and layers, title inflation, KTLO vs innovation, attrition, cost per head, the 80/20 of who delivers), and tells you the story of the run.

Three layers:

| Layer | Question | Doc |
|---|---|---|
| **Live dashboard** | What is my swarm doing right now and what is it costing? | [docs/dashboard.md](docs/dashboard.md) |
| **Run Story** | What just happened, zoomed out, from epic to agent? | [docs/run-story.md](docs/run-story.md) |
| **Benchmark** | How efficient was this swarm vs. the median for comparable work? | [docs/benchmark.md](docs/benchmark.md) |

Existing benchmarks score the model. This scores the *organization of agents* that used it.

## Try it: Grade My Sessions

Open [grader/index.html](grader/index.html) in a browser and drop in a Claude Code session log (`~/.claude/projects/<project>/<session>.jsonl`), or point it at the whole projects folder to grade every session. You get a letter grade, a cost story, and a coach that reads your log and tells you what to change for better outcomes. It runs entirely in your browser and uploads nothing. No log handy? Click "Try an example."

Each coaching tip comes with evidence from your log and a prompt you can paste:

| Signal in the log | Coaching |
|---|---|
| Huge context re-read per turn, very long session | Hand off to a fresh session |
| Edits not followed by a test, build, or check | Make the agent prove the work |
| Prompts that open as corrections | Say what done looks like |
| Failures, bucketed by cause (code, browser, blocked, network...) | A fix matched to the cause |
| Repeated identical calls, files rewritten 6+ times | Break the loop |
| Long read-only research bursts | Hand research to a sub-agent |
| No commits in a long session | Save checkpoints |
| Top-tier model on light lookups | Use a smaller model |

It also reads authoritative cost from the log's own totals, and finds hidden helper models that are billed but never appear in the conversation.

**The workforce battery appears when you run a swarm.** Most sessions today are one agent. For those, the page answers "do you need a swarm?" from how much of your work was parallel research. When sub-agents show up, the swarm view takes over.

> Status: design stage. This repo holds the metric model, the agent survey, the telemetry schema, and the go-to-market plan. The MCP server and Claude Code plugin are next.

## Why this exists

Companies are about to run thousands of agents and sub-agents with no org chart, no leveling, no headcount review, and no cost per head. Human workforce analytics solved this a decade ago. This project ports that battery to agents and adds something humans never allowed: **a survey the workforce takes about itself, cross-checked against telemetry.**

## The battery

| Human metric | Agent analog |
|---|---|
| Who is the mayor? | Highest-centrality node in the delegation and message graph |
| Geo / COLO | Provider, region, hardware, data residency |
| Leveling | Model tier + autonomy level + tool permissions |
| Bonuses | Eval-linked budget and routing preference |
| Spans & layers | Fan-out per parent, delegation depth |
| Contingent mix | Ephemeral/vendor/external agents vs persistent in-house |
| Compa-ratio, position in range | Actual cost per task vs expected for the tier; percentile within the tier's band |
| Title inflation, grade creep | Opus doing Haiku work; average tier per task type rising over time |
| Activity study (RAS) | Span classification: KTLO, innovation, coordination, rework |
| Platoons & squads | Agent teams with shared memory or goals |
| Roles & responsibilities | Declared role vs actual tool calls (role drift) |
| Tool cost / T&E / overhead per head | Tool, external-API, and orchestration spend per agent |
| Make vs buy | Custom agent vs vendor API; human escalations as "professional services" |
| Attrition, regretted attrition | Retirement, crashes, budget-cap kills of top performers |
| Vacation / OOO | Rate-limit stalls, outages, quota exhaustion, utilization |
| LTV of CAC | Onboarding cost (prompts, evals, integrations) vs lifetime value |
| DORA / SPACE | Version deploy frequency, change failure rate, MTTR; human accept rate, flow |
| Revenue per person | Outcome value per agent-day over time |
| Pareto | 20% of agents, prompts, and tools produce 80% of results (and cost) |

Full definitions, formulas, and the data each one needs: [docs/metrics.md](docs/metrics.md).

## How it works

```
 agents / sub-agents ──► MCP server ──► event store (DuckDB) ──► scorecard + Plotly views
        │                    ▲                  ▲
        │  register_agent    │                  │
        │  report_activity   │            OTel GenAI spans (passive)
        └─ submit_survey ────┘            cost ledger, eval/outcome results
```

1. **Registry**: every agent gets an identity (the HRIS row): role, model, tier, parent, squad, tools, region.
2. **Telemetry**: spans, tokens, cost, retries, outcomes. Collected passively via OpenTelemetry GenAI conventions or actively via MCP tool calls.
3. **Survey**: agents answer a structured "RAS" survey about their own work ([survey/agent-ras-survey.md](survey/agent-ras-survey.md)).
4. **Scorecard**: one row per agent and squad, plus a sunburst of the swarm, the mayor graph, and the Pareto curve.

Schema: [schema/schema.sql](schema/schema.sql). MCP tool surface: [docs/mcp-tools.md](docs/mcp-tools.md).

## Lessons from "How to be more ambitious" (Felix Rieseberg)

[The article](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/) argues that most people underuse models and that ambition has four dimensions: speed, altitude, depth, and range. Here is how each shapes this project.

**Altitude: work on the outcome, not the task.**
The goal is not a dashboard of agent metrics. It is a swarm that is *healthy and getting better on its own*. So the product asks what comes after the report: it recommends reorganizations (collapse a layer, downlevel an inflated agent, retire a zombie) and tracks whether they worked. The author's move from "fix this crash" to "keep the apps crash-free" is the same move from "measure agents" to "manage the swarm."

**Depth: do the work the way top experts do.**
- *Use expert instruments.* Spans and layers, compa-ratio, and attrition cohorts are real people-analytics methods. We keep their statistics (cohort survival, percentile bands, centrality) instead of approximating them with prose summaries.
- *Don't let the model grade its own homework.* Agent self-reports are one input. Every survey answer is cross-checked against telemetry (an agent that says it spends 5% of its time on retries but shows 40% retry spans gets flagged). Outcomes come from external signals: tests, human accept rates, downstream results.
- *Challenge assumptions.* The first run should test the beliefs people already hold: "our orchestrator adds value," "we need the big model here."
- *Ask for a deeper version, not a bigger one.* We ship a few metrics done with rigor before we ship twenty done shallowly.

**Range: borrow from other fields, and turn nouns into verbs.**
"Workforce analytics" is a noun. The verbs are: *allocate* spend, *detect* drift, *decide* who to level up, *retire* what no longer earns its cost. Each verb pulls in a different discipline: compensation (compa-ratio), org design (spans and layers), finance (LTV/CAC), reliability engineering (DORA, MTTR), network science (the mayor). We ask for the work these fields do, not for a persona that "acts like" an HR analyst.

**Speed: the prerequisite is access.**
The article notes ambitious use needs a computer and the right data connectors. This project is that connector. An MCP server and plugin that give an agent a way to register, report, and answer the survey in one line.

**Self-efficacy and hard goals.**
Specific, hard goals beat "do your best." Scorecards should therefore set explicit targets (e.g. "KTLO under 20%", "no layer deeper than 3", "top 20% of agents deliver 80%"), not just show numbers. Agents in the survey are asked for a specific, ambitious goal for next period, not a vague intent.

## Roadmap

- [x] `v0.1` Metric spec, schema (run-scoped), survey, dashboard / Run Story / benchmark specs
- [x] `v0.2` Grade My Sessions: browser grader + coach for Claude Code session logs, folder mode (v0 formula, to be calibrated on more logs)
- [ ] `v0.2.1` Calibrate the grade on logs from ~10 people; sub-agent (swarm) log support
- [ ] `v0.3` MCP server (`register_agent`, `report_activity`, `submit_survey`, `get_scorecard`) + local live dashboard
- [ ] `v0.4` Run Story generator + SEI + Claude Code plugin + shareable run card
- [ ] `v0.5` OTel GenAI collector adapter
- [ ] `v1.0` Anonymized benchmark ("how does your swarm compare")

## Go-to-market

The plan (devs first, then platform leaders, then finance), the viral loop, and open questions are in [docs/go-to-market.md](docs/go-to-market.md).

## Contributing

Open an issue with the metric you wish existed for your swarm. PRs welcome on metric definitions, survey questions, and adapters.

## License

MIT
