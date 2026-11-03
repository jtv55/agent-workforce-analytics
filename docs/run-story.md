# The Run Story

People now ship an epic in a day, then start the next one. Nobody reflects on what happened. The agents did the work, and the human lost the plot.

The **Run Story** is the zoomed-out retrospective generated for every run (an epic, project, or session). It is the primary artifact of this tool. The dashboard and scorecard are the evidence behind it.

## Zoom levels

| Level | Question | Contents |
|---|---|---|
| **Epic** | What did I just accomplish? | Goal, outcome, total cost, wall-clock, headcount, one-line verdict |
| **Story** | How did it unfold? | A timeline of phases: who was brought in, when, what changed direction, where the money went |
| **Task** | What did each piece cost and return? | Task cards: owner agent, tier, cost, retries, result |
| **Agent** | Who did the work? | Per-agent review across the full battery |

The user starts at Epic and can zoom in. The view is a single page and works as a screenshot.

## Contents of a Run Story

1. **Headline.** "14 agents, 4 layers, 3h12m, $18.40. 11 deliverables accepted. $1.67 per accepted deliverable. Swarm Efficiency Index 68."
2. **Timeline.** Phases with a one-sentence narrative each, generated from the trace. Example: "Planner spawned 5 workers; two hit rate limits and stalled 11 minutes; reviewer rejected 3 outputs and caused rework."
3. **Org chart.** The delegation tree for this run with the Mayor marked, span and layer counts, and the layers that added cost without output.
4. **Where the money went.** Sunburst by squad, agent, and tool. The largest wedges are annotated.
5. **What was waste.** KTLO, rework, coordination, stalls, and title inflation, each in dollars.
6. **The 80/20.** Which agents produced the results, and which were zombies.
7. **Decisions worth revisiting.** The three moments where a different choice would have saved the most (for example, "using the large tier for log parsing cost $2.10 more than needed").
8. **Agents' own account.** The survey answers, condensed, with the places where the agent's account disagreed with the data.
9. **Next run: three changes.** Specific, hard targets (for example, "cap depth at 3," "downlevel the parser," "add a test tool to the reviewer").
10. **Compared with your last N runs.** Trend lines, so improvement or regression is visible.

## Principle

The story is generated *from the telemetry*, not from the agents' self-description. The agents' survey is quoted alongside it, and the gap between the two is part of the story. An agent's own account is evidence, not a verdict.

## Why this matters

Speed without reflection compounds waste. A ten-second read of the Run Story after each epic is the feedback loop that makes the next one cheaper and better. That repeat use, many runs per week, is also the engagement loop for the product.
