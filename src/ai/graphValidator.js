(function (global) {
  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
  }

  function toIdSet(arr) {
    const s = new Set();
    for (const x of arr) s.add(x);
    return s;
  }

  function topologicalSort(nodes, edges) {
    const incomingCount = new Map();
    const adj = new Map();
    const ids = nodes.map(n => n.id);

    ids.forEach(id => { incomingCount.set(id, 0); adj.set(id, []); });
    edges.forEach(e => {
      if (incomingCount.has(e.to) && adj.has(e.from)) {
        incomingCount.set(e.to, (incomingCount.get(e.to) || 0) + 1);
        adj.get(e.from).push(e.to);
      }
    });

    const q = [];
    incomingCount.forEach((count, id) => { if (count === 0) q.push(id); });
    const order = [];

    while (q.length > 0) {
      const id = q.shift();
      order.push(id);
      const outs = adj.get(id) || [];
      for (const v of outs) {
        incomingCount.set(v, incomingCount.get(v) - 1);
        if (incomingCount.get(v) === 0) q.push(v);
      }
    }

    const isDag = order.length === ids.length;
    return { order, isDag };
  }

  function validateGraph(graph, manifestTypes) {
    const errors = [];
    const warnings = [];
    const placeholders = [];

    const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph && graph.edges) ? graph.edges : [];

    // Basic shape checks
    if (!Array.isArray(nodes)) {
      errors.push({ code: 'schema/nodes', message: 'nodes must be an array', path: 'nodes' });
    }
    if (!Array.isArray(edges)) {
      errors.push({ code: 'schema/edges', message: 'edges must be an array', path: 'edges' });
    }
    if (errors.length) return { ok: false, errors, warnings, placeholders };

    // Unique IDs
    const idCounts = new Map();
    nodes.forEach(n => idCounts.set(n.id, (idCounts.get(n.id) || 0) + 1));
    idCounts.forEach((count, id) => {
      if (!id) errors.push({ code: 'node/id-missing', message: 'node id missing', path: 'nodes' });
      if (count > 1) errors.push({ code: 'node/id-duplicate', message: `duplicate node id: ${id}`, path: `nodes.${id}` });
    });

    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // Unknown node types and placeholder marking
    nodes.forEach(n => {
      const type = n.type;
      if (!type || !manifestTypes[type]) {
        placeholders.push({ id: n.id, type: type || 'unknown' });
      }
    });

    // Edge checks
    edges.forEach((e, idx) => {
      if (!e || !('from' in e) || !('to' in e)) {
        errors.push({ code: 'edge/shape', message: `edge missing from/to at index ${idx}`, path: `edges.${idx}` });
        return;
      }
      if (!nodeById.has(e.from)) {
        errors.push({ code: 'edge/from-missing', message: `edge.from references missing node ${e.from}`, path: `edges.${idx}.from` });
      }
      if (!nodeById.has(e.to)) {
        errors.push({ code: 'edge/to-missing', message: `edge.to references missing node ${e.to}`, path: `edges.${idx}.to` });
      }
      if (e.from === e.to) {
        warnings.push({ code: 'edge/self', message: `self edge on ${e.from}`, path: `edges.${idx}` });
      }

      // Type compatibility and slot validation when both ends are known
      const fromNode = nodeById.get(e.from);
      const toNode = nodeById.get(e.to);
      const fromM = fromNode ? manifestTypes[fromNode.type] : null;
      const toM = toNode ? manifestTypes[toNode.type] : null;
      if (fromM && toM) {
        const fromOut = (fromM.io && fromM.io.outputType) || null;
        const toInputs = (toM.io && Array.isArray(toM.io.inputTypes)) ? toM.io.inputTypes : [];
        const allowedKinds = new Set(toInputs.map(t => t && t.kind).filter(Boolean));
        if (fromOut && allowedKinds.size > 0 && !allowedKinds.has(fromOut)) {
          errors.push({ code: 'edge/type-mismatch', message: `edge ${e.from}->${e.to} type mismatch: ${fromOut} -> expected one of [${[...allowedKinds].join(', ')}]`, path: `edges.${idx}` });
        }

        // Slot rules: optional numeric slot indicates target input position
        if (typeof e.slot !== 'undefined') {
          const slot = Number(e.slot);
          if (!Number.isInteger(slot) || slot < 0) {
            errors.push({ code: 'edge/slot-invalid', message: `invalid slot for edge ${e.from}->${e.to}: ${e.slot}` , path: `edges.${idx}.slot` });
          } else {
            const mode = (toM.io && toM.io.inputMode) || 'single';
            const arity = toInputs.length;
            if (mode === 'single' && slot !== 0) {
              errors.push({ code: 'edge/slot-out-of-range', message: `slot ${slot} out of range for single-input node ${toNode.type}`, path: `edges.${idx}.slot` });
            } else if (mode === 'multi' && arity && slot >= arity) {
              errors.push({ code: 'edge/slot-out-of-range', message: `slot ${slot} >= ${arity} for node ${toNode.type}`, path: `edges.${idx}.slot` });
            }
          }
        }
      }
    });

    // Simple input/output constraints (io-aware)
    nodes.forEach(n => {
      const m = manifestTypes[n.type];
      if (!m) return; // placeholder handled elsewhere
      const incoming = edges.filter(e => e.to === n.id).length;
      const outgoing = edges.filter(e => e.from === n.id).length;

      const io = m.io || { inputTypes: [], inputMode: 'single' };
      const mode = io.inputMode || 'single';
      const declaredInputs = Array.isArray(io.inputTypes) ? io.inputTypes : [];
      const nonOptionalCount = declaredInputs.filter(t => !t || !t.optional).length;
      const minInputs = typeof io.minInputs === 'number' ? io.minInputs : (mode === 'multi' ? nonOptionalCount : (m.requiresInput ? 1 : 0));

      if (m.requiresInput && incoming === 0) {
        errors.push({ code: 'node/inputs-required', message: `${n.type} requires input(s)`, path: `nodes.${n.id}` });
      }
      if (mode === 'single') {
        if (incoming > 1) {
          warnings.push({ code: 'node/inputs-excess', message: `${n.type} expects a single input but has ${incoming}`, path: `nodes.${n.id}` });
        }
      } else if (mode === 'multi') {
        if (incoming < minInputs) {
          errors.push({ code: 'node/inputs-missing', message: `${n.type} requires at least ${minInputs} inputs`, path: `nodes.${n.id}` });
        }
      } else if (mode === 'variadic') {
        const minV = typeof io.minInputs === 'number' ? io.minInputs : (m.requiresInput ? 1 : 0);
        if (incoming < minV) {
          errors.push({ code: 'node/inputs-missing', message: `${n.type} requires at least ${minV} inputs`, path: `nodes.${n.id}` });
        }
      }

      if (typeof m.outputs === 'number' && m.outputs >= 0 && outgoing > m.outputs) {
        warnings.push({ code: 'node/outputs-excess', message: `${n.type} has more outputs (${outgoing}) than declared (${m.outputs})`, path: `nodes.${n.id}` });
      }
    });

    // Parameter validation (shape only)
    nodes.forEach(n => {
      const m = manifestTypes[n.type];
      if (!m) return;
      const defaults = (m && m.defaults) || {};
      const params = n.params || n.parameters || {};
      if (params && typeof params === 'object') {
        Object.keys(params).forEach(k => {
          if (!(k in defaults)) {
            warnings.push({ code: 'param/unknown', message: `unknown param '${k}' on ${n.type}`, path: `nodes.${n.id}.params.${k}` });
          }
        });
      }
    });

    // DAG check
    const { isDag } = topologicalSort(nodes, edges);
    if (!isDag) {
      errors.push({ code: 'graph/cycle', message: 'graph contains a cycle', path: 'edges' });
    }

    // Compute blocked sinks (outputs that cannot be reached due to placeholders)
    const placeholderIds = toIdSet(placeholders.map(p => p.id));
    const blockedSinks = [];
    nodes.forEach(n => {
      const m = manifestTypes[n.type];
      if (!m) return;
      const isSink = (typeof m.outputs === 'number' && m.outputs === 0) || m.category === 'Output';
      if (!isSink) return;
      // If any upstream path contains a placeholder, consider it blocked
      const visited = new Set();
      const stack = [n.id];
      let blocked = false;
      while (stack.length > 0) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);
        if (placeholderIds.has(cur)) { blocked = true; break; }
        const ins = edges.filter(e => e.to === cur).map(e => e.from);
        ins.forEach(x => stack.push(x));
      }
      if (blocked) blockedSinks.push(n.id);
    });

    // Global connectivity check: ensure at least one source->sink path exists
    const isSource = (n) => {
      const m = manifestTypes[n.type];
      if (!m) return false;
      if (m.category === 'Input') return true;
      const io = m.io || { inputTypes: [] };
      return (!m.requiresInput && (!io.inputTypes || io.inputTypes.length === 0));
    };
    const isSink = (n) => {
      const m = manifestTypes[n.type];
      if (!m) return false;
      return (typeof m.outputs === 'number' && m.outputs === 0) || m.category === 'Output';
    };
    const sources = nodes.filter(isSource).map(n => n.id);
    const sinks = nodes.filter(isSink).map(n => n.id);
    if (nodes.length && sinks.length) {
      const adj = new Map();
      nodes.forEach(n => adj.set(n.id, []));
      edges.forEach(e => { if (adj.has(e.from)) adj.get(e.from).push(e.to); });
      const reachable = new Set();
      const dfs = (start) => {
        const stack = [start];
        const vis = new Set();
        while (stack.length) {
          const u = stack.pop();
          if (vis.has(u)) continue; vis.add(u);
          reachable.add(`${start}->${u}`);
          (adj.get(u) || []).forEach(v => stack.push(v));
        }
      };
      sources.forEach(dfs);
      const hasPath = sinks.some(s => sources.some(src => reachable.has(`${src}->${s}`)));
      if (!hasPath) {
        warnings.push({ code: 'graph/disconnected', message: 'no complete source→sink path found', path: 'edges' });
      }
    }

    // Isolated nodes
    nodes.forEach(n => {
      const inDeg = edges.filter(e => e.to === n.id).length;
      const outDeg = edges.filter(e => e.from === n.id).length;
      if (inDeg === 0 && outDeg === 0) {
        warnings.push({ code: 'node/isolated', message: `node ${n.id} (${n.type}) is isolated`, path: `nodes.${n.id}` });
      }
    });

    return {
      ok: errors.length === 0 && placeholders.length === 0,
      errors,
      warnings,
      placeholders,
      blockedSinks
    };
  }

  function applyAutoFixes(graph, manifestTypes) {
    const g = clone(graph) || { nodes: [], edges: [] };
    const fixes = [];

    // Remove edges referencing missing nodes
    const ids = new Set((g.nodes || []).map(n => n.id));
    const cleanedEdges = (g.edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
    if (cleanedEdges.length !== (g.edges || []).length) {
      fixes.push({ code: 'edge/remove-dangling', message: 'removed edges referencing missing nodes' });
      g.edges = cleanedEdges;
    }

    // Fill missing params with defaults, drop unknown params
    (g.nodes || []).forEach(n => {
      const m = manifestTypes[n.type];
      if (!m) return;
      const defaults = (m && m.defaults) || {};
      const params = n.params || n.parameters || {};
      const newParams = { ...defaults, ...params };
      // Optionally drop unknown keys (conservative)
      Object.keys(newParams).forEach(k => {
        if (!(k in defaults)) delete newParams[k];
      });
      if ('params' in n) n.params = newParams; else n.parameters = newParams;
    });

    return { graph: g, fixes };
  }

  function diffGraphs(currentGraph, nextGraph) {
    const a = currentGraph || { nodes: [], edges: [] };
    const b = nextGraph || { nodes: [], edges: [] };

    const aNodes = new Map((a.nodes || []).map(n => [n.id, n]));
    const bNodes = new Map((b.nodes || []).map(n => [n.id, n]));

    const addedNodes = [];
    const removedNodes = [];
    const paramChanges = [];

    bNodes.forEach((n, id) => { if (!aNodes.has(id)) addedNodes.push(id); });
    aNodes.forEach((n, id) => { if (!bNodes.has(id)) removedNodes.push(id); });

    bNodes.forEach((n, id) => {
      const prev = aNodes.get(id);
      if (!prev) return;
      const prevParams = prev.params || prev.parameters || {};
      const nextParams = n.params || n.parameters || {};
      const changedKeys = [];
      const keys = new Set([...Object.keys(prevParams), ...Object.keys(nextParams)]);
      keys.forEach(k => { if (JSON.stringify(prevParams[k]) !== JSON.stringify(nextParams[k])) changedKeys.push(k); });
      if (changedKeys.length) paramChanges.push({ id, keys: changedKeys });
    });

    const aEdges = new Set((a.edges || []).map(e => `${e.from}->${e.to}`));
    const bEdges = new Set((b.edges || []).map(e => `${e.from}->${e.to}`));
    const addedEdges = [...bEdges].filter(x => !aEdges.has(x));
    const removedEdges = [...aEdges].filter(x => !bEdges.has(x));

    return { addedNodes, removedNodes, addedEdges, removedEdges, paramChanges };
  }

  global.GraphValidator = { validateGraph, applyAutoFixes, diffGraphs };
})(window);
