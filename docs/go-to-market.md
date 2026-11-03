# Go-to-market

Decisions so far: lead with an **MCP server + Claude Code plugin**, open-core **MIT**, public repo, and sequence audiences **devs → platform leaders → finance/people-analytics**.

## The product in one line

*"Your agents are a workforce. Get the org chart, the cost per head, and the performance review in 5 minutes."*

## Why this can spread

1. **A shareable artifact.** Each run ends in a scorecard people want to post: the swarm sunburst, the Mayor, a "title inflation" score, the 80/20 curve. People share things that make them look sophisticated or that are funny.
2. **Status and identity.** Naming the Mayor, giving agents a "level," and a swarm's "Pareto score" turn an ops report into something with a personality.
3. **Zero-setup first value.** One install line, then the agent registers and answers the survey itself. The first scorecard should appear in minutes with no config.
4. **A new vocabulary.** "Title inflation," "regretted attrition," "KTLO tax" for agents. Terms that get repeated spread the category.

## Hero artifact: the Run Story

The share card and landing page lead with the [Run Story](run-story.md): the zoomed-out retrospective of an epic, with a Swarm Efficiency Index. It answers a feeling people already have ("I shipped a lot and lost the plot") and it recurs after every run, which drives repeat use.

## Viral loop (v1)

```
install plugin ─► swarm runs ─► scorecard card generated ─► user shares card
      ▲                                                          │
      └──── viewer clicks "score your swarm" (one-line install) ◄┘
```

- Card includes the repo link and an install snippet.
- Anonymous benchmark ("your KTLO tax is 38%; median is 24%") gives a reason to opt in to share data, and the benchmark improves with each opt-in.
- A public "agent census" leaderboard of anonymized swarm stats, updated weekly.

## Audience ladder

| Stage | Who | Hook | Motion |
|---|---|---|---|
| 1 | Solo devs and indie hackers running agent swarms | Cool scorecard, find which sub-agents burn tokens | Bottom-up, open source, share cards |
| 2 | Eng/platform leaders at AI-native companies | Cost per agent, DORA for agents, defend headcount-style spend | Team features, hosted dashboard, SSO |
| 3 | CFO / HR / people analytics | Agents as budgeted headcount; workforce plan includes agents | Services-assisted, board-ready reporting, benchmarks |

## Distribution channels to test

- **Claude Code plugin marketplace and MCP registries**: listing is the discovery channel.
- **Launch post written as the insight, not the tool**: "I ran a workforce analytics battery on my agent swarm and 20% of agents did 80% of the work."
- **Founder-led social**: weekly teardown of a real swarm's scorecard (anonymized).
- **GitHub**: strong README, `good first metric` issues, a simulated-swarm demo anyone can run without credentials.
- **Communities**: agent-framework Discords and subreddits; HR/people-analytics communities for the crossover story.
- **Integrations**: adapters for popular agent frameworks, so the install line is one dependency.

## What a consumer-growth operator would push on

These are principles in the style of operators who built viral consumer products, not claims about any individual's approach.

- **Design for the screenshot first.** If the output is not worth posting, the loop does not start.
- **Time to first value under five minutes**, measured, with the number shown in the README.
- **Every user creates a reason for another user to exist.** The share card is the invitation.
- **Launch into a moment of curiosity.** Agent swarms and agent cost are a live topic right now; ride it.
- **Instrument the funnel on day one**: install → first scorecard → share → install from share. Optimize the weakest step, not the whole thing.
- **Cheap, fast iteration on the card design** (formats, names, scores) because that is the growth lever.

## Monetization (open core)

- Free: local MCP server, CLI, scorecard, survey, simulated dataset.
- Paid: hosted dashboard, team history, SSO, anonymized benchmark access, scheduled reports, recommendations engine.

## Open questions

- Which agent frameworks first? (Claude Code subagents, LangGraph, CrewAI, custom?)
- Is the survey a hero feature (its own viral artifact) or a supporting input?
- What is the share card's single most shareable number?
- Do we name and shame, or only anonymize in the public census?
- Privacy: how to keep prompts and outputs out of anything that leaves the machine.
- Does the product sit under an existing observability vendor's umbrella, or stay independent?
