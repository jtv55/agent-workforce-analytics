/* Grade My Swarm: core logic. Runs in the browser; nothing is uploaded.
 * Input: Claude Code session logs (.jsonl). Output: a report with a letter grade. */
(function (root) {
  'use strict';

  const BUILD = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Artifact', 'DesignSync']);
  const EXPLORE = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch']);
  const RUN = new Set(['Bash', 'PowerShell', 'Monitor', 'Workflow']);
  const COORD = new Set(['TodoWrite', 'Agent', 'Task', 'SendMessage', 'AskUserQuestion', 'EnterPlanMode',
    'ExitPlanMode', 'Skill', 'TaskStop', 'CronCreate', 'CronDelete']);
  const SPAWN = new Set(['Agent', 'Task']);
  const QUIET = new Set(['Read', 'Grep', 'Glob', 'LS', 'ToolSearch', 'TodoWrite']); // repeats here are normal
  const LOOP_WINDOW = 15;
  const GAP_MS = 5 * 60 * 1000; // gaps longer than this are idle time, not work

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

  function newAcc() {
    return {
      sessions: new Set(), titles: [], costBySession: new Map(),
      seenMsg: new Set(), seenTool: new Set(), turns: new Map(), toolName: new Map(),
      calls: 0, byTool: {}, byCat: {}, errors: 0, errByTool: {}, retries: 0, denials: 0, autoApproved: 0,
      human: 0, compactions: 0, sidechain: 0, spawns: 0,
      files: {}, commits: 0, window: [], loops: 0, loopBySig: {},
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
        cr: u.cache_read_input_tokens || 0, cc: u.cache_creation_input_tokens || 0, cats: [],
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
      acc.calls++;
      acc.byTool[name] = (acc.byTool[name] || 0) + 1;
      acc.byCat[cat] = (acc.byCat[cat] || 0) + 1;
      acc.toolName.set(b.id, name);
      turn.cats.push(cat);
      const inp = b.input || {};
      if (SPAWN.has(name)) acc.spawns++;
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

  function onUser(acc, rec) {
    const m = rec.message;
    if (m && typeof m === 'object') {
      const c = m.content;
      if (typeof c === 'string') {
        if (!rec.isMeta && !c.trim().startsWith('<')) acc.human++;
      } else if (Array.isArray(c)) {
        let hasResult = false, text = '';
        for (const b of c) {
          if (!b || typeof b !== 'object') continue;
          if (b.type === 'tool_result') {
            hasResult = true;
            if (b.is_error) {
              acc.errors++;
              const n = acc.toolName.get(b.tool_use_id) || '?';
              acc.errByTool[n] = (acc.errByTool[n] || 0) + 1;
            }
          } else if (b.type === 'text' && typeof b.text === 'string') text += b.text;
        }
        if (!hasResult && !rec.isMeta && text.trim() && !text.trim().startsWith('<')) acc.human++;
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

  function finish(acc) {
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

    // the Mayor: most-used tool
    const toolList = Object.entries(acc.byTool).sort((a, b) => b[1] - a[1]);
    const mayor = toolList.length ? { tool: toolList[0][0], calls: toolList[0][1], share: toolList[0][1] / calls } : null;

    // context tax
    const ctxPerTurn = nTurns ? (acc.tcr + acc.tcc + acc.tin) / nTurns : 0;

    // title inflation: light turns on the top model tier
    let light = 0, topTurns = 0;
    for (const t of turns) {
      if (tier(t.model) !== 'top') continue;
      topTurns++;
      if (t.cats.length && t.cats.every(c => c === 'explore') && t.out < 400) light++;
    }
    const lightShare = topTurns ? light / topTurns : 0;

    // churn and loops
    const fileCounts = Object.values(acc.files);
    const churnFiles = fileCounts.filter(n => n >= 6).length;
    const churnShare = fileCounts.length ? churnFiles / fileCounts.length : 0;
    const loopRate = calls ? acc.loops / calls : 0;
    const topLoop = Object.entries(acc.loopBySig).sort((a, b) => b[1] - a[1])[0];

    const errRate = calls ? acc.errors / calls : 0;
    const retryRate = nTurns ? acc.retries / nTurns : 0;
    const denialRate = calls ? acc.denials / calls : 0;
    const leverageRatio = acc.human ? calls / acc.human : calls;

    // components (0-100)
    const reliability = clamp(100 - (errRate * 350 + retryRate * 400 + denialRate * 100), 0, 100);
    const focus = clamp(100 - (loopRate * 250 + churnShare * 60), 0, 100);
    const ctxScore = clamp(100 - ((ctxPerTurn - 100000) / 500000) * 60, 40, 100);
    const efficiency = clamp(ctxScore - lightShare * 40, 0, 100);
    const leverage = clamp(40 + 10 * Math.log2(Math.max(1, leverageRatio)), 20, 100);
    const score = Math.round(reliability * 0.30 + focus * 0.25 + efficiency * 0.30 + leverage * 0.15);

    // activity mix: errored calls move into "recover"
    const mix = { build: acc.byCat.build || 0, explore: acc.byCat.explore || 0, run: acc.byCat.run || 0,
      coordinate: acc.byCat.coordinate || 0, other: acc.byCat.other || 0 };
    const recover = Math.min(acc.errors, calls);
    const mixTotal = Math.max(1, calls);

    const spanDays = acc.firstTs !== null ? (acc.lastTs - acc.firstTs) / 86400000 : 0;
    const activeMs = (apiMs + toolMs) > 0 ? apiMs + toolMs : acc.activeMs;
    const topFail = Object.entries(acc.errByTool).sort((a, b) => b[1] - a[1])[0];

    // fixes: ranked by points lost
    const cands = [];
    const kk = n => (n >= 1000 ? Math.round(n / 1000) + 'K' : String(Math.round(n)));
    cands.push({ loss: (100 - reliability) * 0.30, title: 'Cut the stumbles',
      detail: acc.errors || acc.retries
        ? `${acc.errors} tool calls failed (${(errRate * 100).toFixed(1)}%)${topFail ? `, mostly ${topFail[0]} (${topFail[1]}x)` : ''}${acc.retries ? `, plus ${acc.retries} API retries` : ''}. Give the agent the missing access, paths, or tool up front.`
        : 'No failures. Nice.' });
    cands.push({ loss: (100 - focus) * 0.25, title: 'Break the loops',
      detail: acc.loops || churnFiles
        ? `${acc.loops} repeated identical calls${topLoop ? ` (worst: ${topLoop[0].split(':')[0]} x${topLoop[1] + 1})` : ''}${churnFiles ? `; ${churnFiles} file${churnFiles > 1 ? 's' : ''} rewritten 6+ times` : ''}. Repeats usually mean the goal or the verification step is unclear.`
        : 'No loops detected.' });
    cands.push({ loss: (100 - ctxScore) * 0.30, title: 'Shrink the context tax',
      detail: `Every turn re-read about ${kk(ctxPerTurn)} tokens of context${spanDays >= 1 ? ` over ${spanDays.toFixed(1)} days` : ''}${acc.compactions ? ` (${acc.compactions} compaction${acc.compactions > 1 ? 's' : ''})` : ''}. Start a fresh session at each milestone, or compact earlier.` });
    cands.push({ loss: lightShare * 40 * 0.30, title: 'Stop over-titling',
      detail: `${light} of ${topTurns} top-tier turns were light lookups. A mid-tier model does those for a fraction of the cost.` });
    cands.push({ loss: leverageRatio < 8 ? (100 - leverage) * 0.15 : 0, title: 'Think bigger per prompt',
      detail: `Only ${leverageRatio.toFixed(1)} tool calls per prompt. You are steering closely. Hand over outcomes, not steps.` });
    cands.sort((a, b) => b.loss - a.loss);
    const fixes = cands.filter(c => c.loss > 0.5).slice(0, 3);
    for (const c of cands) { if (fixes.length >= 3) break; if (!fixes.includes(c)) fixes.push({ ...c, title: c.title + ' (already good)' }); }

    const agents = { leads: Math.max(1, acc.sessions.size), subagents: acc.spawns, helpers: helpers.length };

    return {
      enough: nTurns >= 5,
      title: acc.titles.length ? acc.titles[acc.titles.length - 1] : '',
      score, grade: letter(score),
      components: { reliability, focus, efficiency, leverage },
      agents, helpers, models: acc.modelTurns, perModel,
      turns: nTurns, calls, human: acc.human, leverageRatio,
      cost, costPerTurn: cost !== null && nTurns ? cost / nTurns : null,
      activeMs, spanDays, linesAdded, linesRemoved,
      filesTouched: Object.keys(acc.files).length, commits: acc.commits,
      errors: acc.errors, retries: acc.retries, denials: acc.denials, autoApproved: acc.autoApproved,
      loops: acc.loops, churnFiles, compactions: acc.compactions, ctxPerTurn,
      mix, recover, mixTotal, mayor, top20share, topTurnCost, lightShare, light, topTurns,
      fixes, records: acc.records, startedAt: acc.firstTs,
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
    if (opts && opts.subagents) rep.agents.subagents = Math.max(rep.agents.subagents, opts.subagents);
    return rep;
  }

  // A small synthetic run so people without logs can see what a grade looks like.
  function sampleReport() {
    const acc = newAcc();
    const sid = 'sample';
    let t = Date.parse('2026-01-05T09:00:00Z');
    const tools = ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'WebSearch', 'Bash', 'Bash'];
    let id = 0;
    feed(acc, { type: 'custom-title', customTitle: 'Example: ship a landing page', sessionId: sid });
    for (let i = 0; i < 90; i++) {
      t += 40000;
      if (i % 9 === 0) feed(acc, { type: 'user', sessionId: sid, timestamp: new Date(t).toISOString(), message: { role: 'user', content: 'do the next thing' } });
      const name = tools[i % tools.length];
      const input = name === 'Bash' && i % 7 === 0 ? { command: 'npm test' } : { file_path: 'src/f' + (i % 5) + '.js', command: 'step ' + i };
      const mid = 'm' + i; const tid = 't' + (id++);
      feed(acc, { type: 'assistant', sessionId: sid, timestamp: new Date(t).toISOString(), message: { id: mid, model: 'claude-sonnet-5-5',
        usage: { output_tokens: 300 + (i % 5) * 400, input_tokens: 10, cache_read_input_tokens: 120000 + i * 2500, cache_creation_input_tokens: 4000 },
        content: [{ type: 'tool_use', id: tid, name, input }] } });
      feed(acc, { type: 'user', sessionId: sid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, is_error: i % 11 === 0 }] } });
    }
    feed(acc, { type: 'cost-state', sessionId: sid, totalCostUSD: 4.82, totalAPIDuration: 1200000, totalToolDuration: 900000,
      totalLinesAdded: 640, totalLinesRemoved: 80,
      modelUsage: { 'claude-sonnet-5-5': { costUSD: 4.5, inputTokens: 900, outputTokens: 40000 }, 'claude-haiku-5-5': { costUSD: 0.32, inputTokens: 210000, outputTokens: 9000, webSearchRequests: 12 } } });
    return finish(acc);
  }

  root.Grader = { gradeStreams, sampleReport, category, tier, letter, _feed: feed, _newAcc: newAcc, _finish: finish };
})(typeof window !== 'undefined' ? window : globalThis);
