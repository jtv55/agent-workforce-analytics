/* Grade My Sessions: core logic. Runs in the browser; nothing is uploaded.
 * Input: Claude Code session logs (.jsonl). Output: a report with a letter grade and coaching. */
(function (root) {
  'use strict';

  const BUILD = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Artifact', 'DesignSync']);
  const EDITS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
  const EXPLORE = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch']);
  const RUN = new Set(['Bash', 'PowerShell', 'Monitor', 'Workflow']);
  const COORD = new Set(['TodoWrite', 'Agent', 'Task', 'SendMessage', 'AskUserQuestion', 'EnterPlanMode',
    'ExitPlanMode', 'Skill', 'TaskStop', 'CronCreate', 'CronDelete']);
  const SPAWN = new Set(['Agent', 'Task']);
  const QUIET = new Set(['Read', 'Grep', 'Glob', 'LS', 'ToolSearch', 'TodoWrite']); // repeats here are normal
  const LOOP_WINDOW = 15;
  const GAP_MS = 5 * 60 * 1000; // gaps longer than this are idle time, not work
  const BURST_MIN = 6;          // consecutive read-only calls that count as a research burst
  const VERIFY_WINDOW = 6;      // calls after an edit in which a check counts as verification
  const VERIFY_RE = /\b(test|tests|pytest|jest|vitest|mocha|build|lint|tsc|mypy|ruff|eslint|compile|verify|check|cargo (test|build|check)|go (test|build|vet)|npm run|pnpm|yarn)\b/i;
  const CORRECT_START = /^\s*(no\b|nope|wrong|actually|that'?s not|that is not|not what|still (not|broken|wrong|doesn'?t|isn'?t)|undo|revert|don'?t|do not|stop\b|why did you|you (didn'?t|forgot|missed|broke)|i (said|asked|meant)|instead)/i;
  const CORRECT_ANY = /(doesn'?t work|isn'?t working|didn'?t work|still broken|that broke|not working)/i;

  function category(name) {
    if (BUILD.has(name)) return 'build';
    if (EXPLORE.has(name)) return 'explore';
    if (RUN.has(name)) return 'run';
    if (COORD.has(name)) return 'coordinate';
    if (name.startsWith('mcp__')) {
      const t = name.split('__').pop();
      if (/^(update_plan|wrap_up|mark_chapter|start_session|dismiss|hand_off)/.test(t)) return 'coordinate';
      if (/^(read_|get_|list_|find|search|tabs_context|screenshot|navigate|query|fetch|preview_list)/.test(t)) return 'explore';
      if (/^(computer|javascript|form_input|browser_batch|resize|left_click|type|key|scroll)/.test(t)) return 'run';
      if (/^(save_|create|update|write|batch|delete|send|append)/.test(t)) return 'build';
    }
    return 'other';
  }

  function tier(model) {
    if (/opus/i.test(model)) return 'top';
    if (/sonnet/i.test(model)) return 'mid';
    if (/haiku/i.test(model)) return 'small';
    return 'other';
  }

  function isVerify(name, inp) {
    if (RUN.has(name)) return VERIFY_RE.test(String(inp.command || ''));
    return /Browser__(computer|read_console_messages|get_page_text|read_page)$/.test(name);
  }

  function errKind(text) {
    if (/user (rejected|doesn'?t want|denied)|request (was )?(aborted|interrupted)|interrupted by user|tool use was rejected/i.test(text)) return 'rejected';
    if (/access denied: this tool|requires the .{0,40}(plan|tier)|blocked:|is blocked|protected|permission denied|access is denied|eacces|not allowed|forbidden/i.test(text)) return 'blocked';
    if (/screenshot (failed|timed out)|no longer open|tab .{0,20}(closed|not found)|page did not|preview tab/i.test(text)) return 'browser';
    if (/unable to connect|connection (refused|reset)|econnrefused|enotfound|could not resolve|getaddrinfo/i.test(text)) return 'network';
    if (/no such file|not found|cannot find|does not exist|enoent|is not recognized|cannot access|couldn'?t open file/i.test(text)) return 'notfound';
    if (/timed? ?out|timeout/i.test(text)) return 'timeout';
    if (/syntax ?error|unexpected token|unexpected eof|parse error|invalid syntax|cannot parse/i.test(text)) return 'syntax';
    if (/module ?not ?found|no module named|cannot import|importerror|not installed|command not found/i.test(text)) return 'missingdep';
    if (/traceback|typeerror|referenceerror|exception|assertionerror|exit code [1-9]/i.test(text)) return 'code';
    return 'other';
  }

  function textOf(c) {
    if (typeof c === 'string') return c;
    if (!Array.isArray(c)) return '';
    let s = '';
    for (const b of c) if (b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string') s += b.text;
    return s;
  }

  function newAcc() {
    return {
      sessions: new Set(), titles: [], costBySession: new Map(),
      seenMsg: new Set(), seenTool: new Set(), turns: new Map(), toolName: new Map(),
      calls: 0, byTool: {}, byCat: {}, errors: 0, errByTool: {}, errKinds: {}, rejected: 0,
      retries: 0, denials: 0, autoApproved: 0,
      human: 0, corrections: 0, compactions: 0, sidechain: 0, spawns: 0,
      files: {}, commits: 0, window: [], loops: 0, loopBySig: {},
      exploreRun: 0, bursts: 0, burstCalls: 0, pendingVerify: 0, editBatches: 0, verifiedBatches: 0,
      tin: 0, tout: 0, tcr: 0, tcc: 0, modelTurns: {},
      firstTs: null, lastTs: null, lastSeen: null, activeMs: 0, records: 0,
    };
  }

  function sigOf(name, input) {
    let s = '';
    try { s = JSON.stringify(input || {}); } catch (e) { /* ignore */ }
    return name + ':' + s.slice(0, 300);
  }

  function feed(acc, rec) {
    acc.records++;
    if (rec.sessionId) acc.sessions.add(rec.sessionId);
    if (rec.isSidechain) acc.sidechain++;
    if (rec.retryAttempt) acc.retries++;
    if (rec.timestamp) {
      const ms = Date.parse(rec.timestamp);
      if (!isNaN(ms)) {
        if (acc.firstTs === null || ms < acc.firstTs) acc.firstTs = ms;
        if (acc.lastTs === null || ms > acc.lastTs) acc.lastTs = ms;
        if (acc.lastSeen !== null) {
          const gap = ms - acc.lastSeen;
          if (gap > 0 && gap <= GAP_MS) acc.activeMs += gap;
        }
        acc.lastSeen = ms;
      }
    }
    switch (rec.type) {
      case 'custom-title': if (rec.customTitle) acc.titles.push(rec.customTitle); break;
      case 'cost-state': {
        if (!(rec.totalCostUSD > 0)) break; // 0 means "not recorded", not "free"
        const prev = acc.costBySession.get(rec.sessionId);
        if (!prev || (rec.totalCostUSD || 0) >= (prev.totalCostUSD || 0)) acc.costBySession.set(rec.sessionId, rec);
        break;
      }
      case 'system': if (rec.subtype === 'compact_boundary') acc.compactions++; break;
      case 'assistant': onAssistant(acc, rec); break;
      case 'user': onUser(acc, rec); break;
      default: break;
    }
  }

  function flushBurst(acc) {
    if (acc.exploreRun >= BURST_MIN) { acc.bursts++; acc.burstCalls += acc.exploreRun; }
    acc.exploreRun = 0;
  }

  function onAssistant(acc, rec) {
    const m = rec.message;
    if (!m || typeof m !== 'object') return;
    const model = m.model || '';
    if (model === '<synthetic>') return;
    const id = m.id || rec.requestId || rec.uuid;
    let turn = acc.turns.get(id);
    if (!turn) {
      const u = m.usage || {};
      turn = {
        model, out: u.output_tokens || 0, inp: u.input_tokens || 0,
        cr: u.cache_read_input_tokens || 0, cc: u.cache_creation_input_tokens || 0, cats: [], tc: 0,
      };
      acc.turns.set(id, turn);
      acc.tin += turn.inp; acc.tout += turn.out; acc.tcr += turn.cr; acc.tcc += turn.cc;
      acc.modelTurns[model] = (acc.modelTurns[model] || 0) + 1;
    }
    if (!Array.isArray(m.content)) return;
    for (const b of m.content) {
      if (!b || b.type !== 'tool_use' || acc.seenTool.has(b.id)) continue;
      acc.seenTool.add(b.id);
      const name = b.name || '?';
      const cat = category(name);
      const inp = b.input || {};
      acc.calls++;
      acc.byTool[name] = (acc.byTool[name] || 0) + 1;
      acc.byCat[cat] = (acc.byCat[cat] || 0) + 1;
      acc.toolName.set(b.id, name);
      turn.cats.push(cat); turn.tc++;
      if (SPAWN.has(name)) acc.spawns++;

      if (cat === 'explore') acc.exploreRun++; else flushBurst(acc);

      if (EDITS.has(name)) { if (acc.pendingVerify === 0) acc.editBatches++; acc.pendingVerify = VERIFY_WINDOW; }
      else if (acc.pendingVerify > 0) {
        if (isVerify(name, inp)) { acc.verifiedBatches++; acc.pendingVerify = 0; } else acc.pendingVerify--;
      }

      if ((name === 'Write' || name === 'Edit' || name === 'MultiEdit') && inp.file_path) {
        acc.files[inp.file_path] = (acc.files[inp.file_path] || 0) + 1;
      }
      if ((name === 'Bash' || name === 'PowerShell') && /\bgit\s+commit\b/.test(String(inp.command || ''))) acc.commits++;
      if (!QUIET.has(name) && cat !== 'explore' && cat !== 'coordinate') {
        const sig = sigOf(name, inp);
        if (acc.window.includes(sig)) { acc.loops++; acc.loopBySig[sig] = (acc.loopBySig[sig] || 0) + 1; }
        acc.window.push(sig);
        if (acc.window.length > LOOP_WINDOW) acc.window.shift();
      }
    }
  }

  function onHuman(acc, text) {
    acc.human++;
    flushBurst(acc);
    const head = text.slice(0, 300);
    if (CORRECT_START.test(head) || CORRECT_ANY.test(head)) acc.corrections++;
  }

  function onUser(acc, rec) {
    const m = rec.message;
    if (m && typeof m === 'object') {
      const c = m.content;
      if (typeof c === 'string') {
        if (!rec.isMeta && !c.trim().startsWith('<')) onHuman(acc, c);
      } else if (Array.isArray(c)) {
        let hasResult = false;
        for (const b of c) {
          if (!b || typeof b !== 'object' || b.type !== 'tool_result') continue;
          hasResult = true;
          if (b.is_error) {
            const kind = errKind(textOf(b.content).slice(0, 600));
            if (kind === 'rejected') { acc.rejected++; continue; } // you steering, not the agent failing
            acc.errors++;
            acc.errKinds[kind] = (acc.errKinds[kind] || 0) + 1;
            const n = acc.toolName.get(b.tool_use_id) || '?';
            acc.errByTool[n] = (acc.errByTool[n] || 0) + 1;
          }
        }
        const text = textOf(c);
        if (!hasResult && !rec.isMeta && text.trim() && !text.trim().startsWith('<')) onHuman(acc, text);
      }
    }
    const pd = rec.permissionDecision;
    if (pd && typeof pd === 'object') {
      if (pd.decision !== 'accept') acc.denials++;
      else if (pd.reasonType === 'classifier') acc.autoApproved++;
    } else if (rec.toolDenialKind) acc.denials++;
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function letter(s) {
    const t = [[97, 'A+'], [93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'], [77, 'C+'],
      [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-']];
    for (const [min, l] of t) if (s >= min) return l;
    return 'F';
  }

  const KIND_ADVICE = {
    notfound: ['files or commands it could not find', 'Tell the agent where things live: the working directory, key file paths, and which tools are installed.'],
    blocked: ['blocked actions or plan limits', 'Tell the agent which tools and paths are off limits, or grant access up front, so it stops retrying them.'],
    browser: ['browser-tool hiccups', 'Have it re-check the open tab before acting, keep to one tab, and fall back to reading page text when screenshots time out.'],
    network: ['network failures', 'Tell it which services are reachable, and to retry once after a pause before changing approach.'],
    code: ['code that threw errors', 'Ask for a failing test or a minimal repro first, then the fix, so each attempt is checked quickly.'],
    timeout: ['timeouts', 'Tell it to run long jobs in the background and poll, and to set explicit time limits.'],
    syntax: ['syntax errors', 'Name the shell and language versions you use so it writes commands that fit.'],
    missingdep: ['missing packages or commands', 'Tell it what is installed, or to check and install dependencies first.'],
    other: ['assorted errors', 'Ask it to read the error, state a cause, and change approach after two failures.'],
  };

  function finish(acc) {
    // flush a trailing research burst without mutating the accumulator
    let bursts = acc.bursts, burstCalls = acc.burstCalls;
    if (acc.exploreRun >= BURST_MIN) { bursts++; burstCalls += acc.exploreRun; }

    const turns = [...acc.turns.values()];
    const nTurns = turns.length;
    const calls = acc.calls;

    // cost: authoritative from the log when present
    let cost = null; const perModel = {};
    let usd = 0, apiMs = 0, toolMs = 0, linesAdded = 0, linesRemoved = 0;
    for (const cs of acc.costBySession.values()) {
      usd += cs.totalCostUSD || 0; apiMs += cs.totalAPIDuration || 0; toolMs += cs.totalToolDuration || 0;
      linesAdded += cs.totalLinesAdded || 0; linesRemoved += cs.totalLinesRemoved || 0;
      for (const [k, v] of Object.entries(cs.modelUsage || {})) {
        const p = perModel[k] || (perModel[k] = { costUSD: 0, input: 0, output: 0, web: 0 });
        p.costUSD += v.costUSD || 0; p.input += v.inputTokens || 0; p.output += v.outputTokens || 0;
        p.web += v.webSearchRequests || 0;
      }
    }
    if (acc.costBySession.size) cost = usd;

    // hidden helpers: models billed in cost-state that never appear as a conversation turn
    const helpers = Object.entries(perModel)
      .filter(([k]) => !(k in acc.modelTurns) && (perModel[k].costUSD > 0 || perModel[k].input > 0))
      .map(([k, v]) => ({ model: k, costUSD: v.costUSD, input: v.input, web: v.web }));

    // spend concentration (Pareto): allocate cost over turns by token weight
    const w = turns.map(t => t.out * 5 + t.cc * 1.25 + t.inp + t.cr * 0.1);
    const wSum = w.reduce((a, b) => a + b, 0) || 1;
    const sorted = w.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
    const top20n = Math.max(1, Math.ceil(nTurns * 0.2));
    const top20share = sorted.slice(0, top20n).reduce((a, b) => a + b[0], 0) / wSum;
    const topTurnCost = cost !== null && nTurns ? (sorted[0][0] / wSum) * cost : null;

    const toolList = Object.entries(acc.byTool).sort((a, b) => b[1] - a[1]);
    const mayor = toolList.length ? { tool: toolList[0][0], calls: toolList[0][1], share: toolList[0][1] / calls } : null;

    const ctxPerTurn = nTurns ? (acc.tcr + acc.tcc + acc.tin) / nTurns : 0;

    // title inflation: light turns on the top model tier
    let light = 0, topTurns = 0, parTurns = 0, toolTurns = 0;
    for (const t of turns) {
      if (t.tc > 0) { toolTurns++; if (t.tc >= 2) parTurns++; }
      if (tier(t.model) !== 'top') continue;
      topTurns++;
      if (t.cats.length && t.cats.every(c => c === 'explore') && t.out < 400) light++;
    }
    const lightShare = topTurns ? light / topTurns : 0;
    const parallelShare = toolTurns ? parTurns / toolTurns : 0;

    const fileCounts = Object.values(acc.files);
    const churnFiles = fileCounts.filter(n => n >= 6).length;
    const churnShare = fileCounts.length ? churnFiles / fileCounts.length : 0;
    const loopRate = calls ? acc.loops / calls : 0;
    const topLoop = Object.entries(acc.loopBySig).sort((a, b) => b[1] - a[1])[0];

    const errRate = calls ? acc.errors / calls : 0;
    const retryRate = nTurns ? acc.retries / nTurns : 0;
    const denialRate = calls ? acc.denials / calls : 0;
    const leverageRatio = acc.human ? calls / acc.human : calls;
    const verifyRate = acc.editBatches ? acc.verifiedBatches / acc.editBatches : null;
    const corrRate = acc.human ? acc.corrections / acc.human : 0;
    const burstShare = calls ? burstCalls / calls : 0;

    // grade components (0-100)
    const reliability = clamp(100 - (errRate * 350 + retryRate * 400 + denialRate * 100), 0, 100);
    const focus = clamp(100 - (loopRate * 250 + churnShare * 60), 0, 100);
    const ctxScore = clamp(100 - ((ctxPerTurn - 100000) / 500000) * 60, 40, 100);
    const efficiency = clamp(ctxScore - lightShare * 40, 0, 100);
    const leverage = clamp(40 + 10 * Math.log2(Math.max(1, leverageRatio)), 20, 100);
    const score = Math.round(reliability * 0.30 + focus * 0.25 + efficiency * 0.30 + leverage * 0.15);

    const mix = { build: acc.byCat.build || 0, explore: acc.byCat.explore || 0, run: acc.byCat.run || 0,
      coordinate: acc.byCat.coordinate || 0, other: acc.byCat.other || 0 };
    const recover = Math.min(acc.errors, calls);

    const spanDays = acc.firstTs !== null ? (acc.lastTs - acc.firstTs) / 86400000 : 0;
    const activeMs = (apiMs + toolMs) > 0 ? apiMs + toolMs : acc.activeMs;
    const topFail = Object.entries(acc.errByTool).sort((a, b) => b[1] - a[1])[0];
    const topKind = Object.entries(acc.errKinds).sort((a, b) => b[1] - a[1])[0];

    // coaching: each tip has evidence from this log and a prompt to paste
    const kk = n => (n >= 1000 ? Math.round(n / 1000) + 'K' : String(Math.round(n)));
    const pct = x => Math.round(x * 100) + '%';
    const tips = [];

    tips.push({ id: 'context', loss: (100 - ctxScore) * 0.30,
      title: 'Shrink the context tax',
      detail: `Every turn re-read about ${kk(ctxPerTurn)} tokens of context${spanDays >= 1 ? ` over ${spanDays.toFixed(1)} days` : ''}${acc.compactions ? ` (${acc.compactions} compaction${acc.compactions > 1 ? 's' : ''})` : ''}. Long sessions get slower, pricier, and fuzzier.`,
      tryIt: 'Before we move on, write HANDOFF.md: decisions made, current state, and next steps. Then I will start a fresh session from it.' });

    if (acc.editBatches >= 5 && verifyRate !== null) {
      tips.push({ id: 'verify', loss: verifyRate >= 0.6 ? 0 : (1 - verifyRate) * 12,
        title: 'Make it prove the work',
        detail: `Only ${acc.verifiedBatches} of ${acc.editBatches} rounds of edits were followed by a test, build, or check (${pct(verifyRate)}). Unverified changes are where surprises come from.`,
        tryIt: 'After every change, run the tests (or build, or take a screenshot) and show me the result before continuing. If there is no test yet, write one first.' });
    }

    if (acc.human >= 8) {
      tips.push({ id: 'corrections', loss: corrRate * 30,
        title: 'Say what done looks like',
        detail: `${acc.corrections} of your ${acc.human} prompts opened as a correction (${pct(corrRate)}). That usually means the goal was understood differently than you meant it.`,
        tryIt: 'Before building anything, restate my goal in your own words and list three acceptance criteria. Wait for me to confirm.' });
    }

    if (acc.errors || acc.retries) {
      const adv = KIND_ADVICE[topKind ? topKind[0] : 'other'];
      tips.push({ id: 'errors', loss: (100 - reliability) * 0.30,
        title: 'Cut the stumbles',
        detail: `${acc.errors} tool calls failed (${(errRate * 100).toFixed(1)}%)${topFail ? `, mostly ${topFail[0]} (${topFail[1]}x)` : ''}${topKind ? `; the biggest bucket was ${adv[0]} (${topKind[1]})` : ''}${acc.retries ? `, plus ${acc.retries} API retries` : ''}.`,
        tryIt: adv[1] });
    }

    if (acc.loops || churnFiles) {
      tips.push({ id: 'loops', loss: (100 - focus) * 0.25,
        title: 'Break the loops',
        detail: `${acc.loops} repeated identical calls${topLoop ? ` (worst: ${topLoop[0].split(':')[0]} x${topLoop[1] + 1})` : ''}${churnFiles ? `; ${churnFiles} file${churnFiles > 1 ? 's' : ''} rewritten 6+ times` : ''}.`,
        tryIt: 'If you try the same approach twice without progress, stop. Tell me what you learned and propose a different approach before continuing.' });
    }

    if (calls >= 40 && burstShare >= 0.10) {
      tips.push({ id: 'bursts', loss: burstShare * 20,
        title: 'Hand research to a sub-agent',
        detail: `${bursts} research burst${bursts > 1 ? 's' : ''} (${BURST_MIN}+ read-only lookups in a row) made up ${pct(burstShare)} of your calls, and all of it landed in your main context.`,
        tryIt: 'Use a sub-agent to research this and report back a summary of ten lines or fewer. Do not read the files yourself.' });
    }

    if (nTurns >= 60 && acc.commits === 0) {
      tips.push({ id: 'commits', loss: 5,
        title: 'Save checkpoints',
        detail: `${nTurns} turns and no commits. If a change goes wrong, there is nothing to roll back to.`,
        tryIt: 'Commit after each working milestone with a clear message, so we can roll back safely.' });
    }

    if (lightShare > 0.05) {
      tips.push({ id: 'titles', loss: lightShare * 40 * 0.30,
        title: 'Stop over-titling',
        detail: `${light} of ${topTurns} top-tier turns were light lookups. A mid-tier model handles those for a fraction of the cost.`,
        tryIt: 'Use a smaller model for lookups and file reading; save the large model for design and hard debugging.' });
    }

    if (leverageRatio < 8 && acc.human >= 8) {
      tips.push({ id: 'leverage', loss: (100 - leverage) * 0.15,
        title: 'Hand over outcomes, not steps',
        detail: `Only ${leverageRatio.toFixed(1)} tool calls per prompt. You are steering closely.`,
        tryIt: 'Here is the outcome I want and how I will judge it. Plan the steps yourself and ask me only if you are blocked.' });
    }

    tips.sort((a, b) => b.loss - a.loss);
    const coach = tips.filter(t => t.loss > 0.5).slice(0, 4);

    // strengths
    const strengths = [];
    if (calls >= 30 && errRate < 0.03) strengths.push(`Few failed calls (${(errRate * 100).toFixed(1)}%).`);
    if (verifyRate !== null && acc.editBatches >= 5 && verifyRate >= 0.6) strengths.push(`You verify: ${pct(verifyRate)} of edit rounds were followed by a check.`);
    if (acc.commits >= 3 && acc.commits >= nTurns / 80) strengths.push(`You save checkpoints (${acc.commits} commits).`);
    if (acc.human >= 8 && corrRate < 0.08) strengths.push('Your prompts rarely need correcting.');
    if (leverageRatio >= 10 && acc.human >= 3) strengths.push(`You delegate whole outcomes (${leverageRatio.toFixed(0)} tool calls per prompt).`);
    if (acc.loops <= 3 && calls >= 30) strengths.push('Almost no repeated-call loops.');

    // swarm readiness: how much of the work looks parallelizable, and is a swarm in play?
    const subagents = acc.spawns;
    const swarm = {
      active: subagents > 0, subagents, bursts, burstShare, parallelShare,
      verdict: burstShare < 0.10 ? 'serial' : burstShare < 0.30 ? 'some' : 'lots',
    };

    const agents = { leads: Math.max(1, acc.sessions.size), subagents, helpers: helpers.length };

    return {
      enough: nTurns >= 5,
      title: acc.titles.length ? acc.titles[acc.titles.length - 1] : '',
      score, grade: letter(score),
      components: { reliability, focus, efficiency, leverage },
      agents, helpers, models: acc.modelTurns, perModel,
      turns: nTurns, calls, human: acc.human, leverageRatio, corrections: acc.corrections, rejected: acc.rejected,
      cost, costPerTurn: cost !== null && nTurns ? cost / nTurns : null,
      activeMs, spanDays, linesAdded, linesRemoved,
      filesTouched: Object.keys(acc.files).length, commits: acc.commits,
      editBatches: acc.editBatches, verifiedBatches: acc.verifiedBatches, verifyRate,
      errors: acc.errors, errKinds: acc.errKinds, retries: acc.retries, denials: acc.denials, autoApproved: acc.autoApproved,
      loops: acc.loops, churnFiles, compactions: acc.compactions, ctxPerTurn,
      mix, recover, mixTotal: Math.max(1, calls), mayor, top20share, topTurnCost, lightShare, light, topTurns,
      tips: coach, fixes: coach.length ? coach : [{ title: 'Nothing urgent', detail: 'No clear problems found.', tryIt: '' }],
      strengths: strengths.slice(0, 3), swarm,
      records: acc.records, startedAt: acc.firstTs,
    };
  }

  async function readLines(stream, onLine) {
    const reader = stream.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
    }
    buf += dec.decode();
    if (buf.trim()) onLine(buf);
  }

  // opts.subagents: number of separate sub-agent log files that belong to this run
  async function gradeStreams(streams, onProgress, opts) {
    const acc = newAcc();
    let n = 0;
    for (const s of streams) {
      acc.lastSeen = null;
      await readLines(s, line => {
        let r;
        try { r = JSON.parse(line); } catch (e) { return; }
        feed(acc, r);
        if (onProgress && ++n % 2000 === 0) onProgress(n);
      });
    }
    const rep = finish(acc);
    if (opts && opts.subagents) {
      rep.agents.subagents = Math.max(rep.agents.subagents, opts.subagents);
      rep.swarm.subagents = rep.agents.subagents; rep.swarm.active = true;
    }
    return rep;
  }

  // A small synthetic run so people without logs can see what a grade looks like.
  function sampleReport() {
    const acc = newAcc();
    const sid = 'sample';
    let t = Date.parse('2026-01-05T09:00:00Z');
    const tools = ['Read', 'Read', 'Grep', 'Read', 'Grep', 'Read', 'Read', 'Edit', 'Bash', 'Write', 'Edit', 'Bash', 'WebSearch', 'Bash'];
    let id = 0;
    feed(acc, { type: 'custom-title', customTitle: 'Example: ship a landing page', sessionId: sid });
    for (let i = 0; i < 98; i++) {
      t += 40000;
      if (i % 9 === 0) feed(acc, { type: 'user', sessionId: sid, timestamp: new Date(t).toISOString(), message: { role: 'user', content: i % 18 === 0 && i > 0 ? 'no, that is not what I meant' : 'do the next thing' } });
      const name = tools[i % tools.length];
      const input = name === 'Bash' && i % 7 === 0 ? { command: 'npm test' } : name === 'Bash' ? { command: 'ls src' } : { file_path: 'src/f' + (i % 5) + '.js', command: 'step ' + i };
      const mid = 'm' + i; const tid = 't' + (id++);
      feed(acc, { type: 'assistant', sessionId: sid, timestamp: new Date(t).toISOString(), message: { id: mid, model: 'claude-sonnet-5-5',
        usage: { output_tokens: 300 + (i % 5) * 400, input_tokens: 10, cache_read_input_tokens: 120000 + i * 2500, cache_creation_input_tokens: 4000 },
        content: [{ type: 'tool_use', id: tid, name, input }] } });
      feed(acc, { type: 'user', sessionId: sid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, is_error: i % 11 === 0, content: 'No such file or directory' }] } });
    }
    feed(acc, { type: 'cost-state', sessionId: sid, totalCostUSD: 4.82, totalAPIDuration: 1200000, totalToolDuration: 900000,
      totalLinesAdded: 640, totalLinesRemoved: 80,
      modelUsage: { 'claude-sonnet-5-5': { costUSD: 4.5, inputTokens: 900, outputTokens: 40000 }, 'claude-haiku-5-5': { costUSD: 0.32, inputTokens: 210000, outputTokens: 9000, webSearchRequests: 12 } } });
    return finish(acc);
  }

  root.Grader = { gradeStreams, sampleReport, category, tier, letter, _feed: feed, _newAcc: newAcc, _finish: finish };
})(typeof window !== 'undefined' ? window : globalThis);
