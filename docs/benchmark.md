# Benchmark: the Swarm Efficiency Index

Existing benchmarks score the model on a task. This scores the **organization of agents** that did a piece of work: how it was structured, what it cost, and how much effort was waste.

Two teams on the same model can differ several times over on cost per accepted deliverable because of layers, retries, rework, and title inflation. The benchmark measures that gap.

## Swarm Efficiency Index (SEI)

A 0-100 score per run. The formula and every sub-score are published.

```
SEI = 100 × quality_factor × efficiency_factor × (1 − waste_share)
```

| Component | Definition |
|---|---|
| `quality_factor` | Accepted deliverables ÷ attempted, weighted by external eval or human accept. Never agent self-assessment |
| `efficiency_factor` | Median cost per accepted outcome for this task type ÷ your cost per accepted outcome (capped at 1). This is the compa-ratio inverted |
| `waste_share` | (rework + KTLO beyond baseline + stalls + coordination beyond baseline + title-inflation excess) ÷ total cost |

Sub-scores reported next to the index: structure (spans and layers), level fit (title inflation), reliability (stalls, failures), calibration (agents' confidence vs. outcomes), and concentration (Pareto).

## Normalization

Raw dollars are not comparable across projects. Every comparison is made against the median for the same `task_type` and `complexity` band. Until enough peer data exists, the baseline comes from the simulated reference dataset in this repo and is labeled as such.

## Outcome unit

Configurable per project. Default: **cost per accepted deliverable**. Other choices: per merged PR, per resolved ticket, per passing test suite, per document accepted by a human.

## Modes

| Mode | Description | Release |
|---|---|---|
| **Organic** | Your real runs, compared with your own history and, if opted in, anonymized peers by category | v1 |
| **Reference** | A fixed suite of standard projects anyone can run for a head-to-head score | Later, after organic data shows which tasks are representative |

## Anti-gaming

- Quality must come from an external signal (tests, evals, human accept). A swarm cannot raise its SEI by grading itself.
- Efficiency counts only accepted outcomes, so cheap-and-wrong scores low.
- Metric definitions are versioned; scores state the version.
- Public leaderboard entries are opt-in and aggregate-only. No prompts or outputs leave the machine.
