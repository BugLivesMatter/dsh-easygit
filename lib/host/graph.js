/**
 * Commit-DAG layout for the GitLens-style graph.
 *
 * The host computes rows, lanes, edge segments and stable branch colours so the
 * browser half only draws; the algorithm is a pure function and is unit-tested
 * without git or a DOM.
 *
 * @module @local/easygit/host/graph
 */

/** Number of branch colours the client palette provides. */
export const PALETTE_SIZE = 10

/** Stable hash used for a branch colour. */
function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Stable palette index for a branch name. The integration branches get their
 * own accent slot so the working line reads as the reference line.
 * @param {string} name
 * @returns {number}
 */
export function colorIndexForBranch(name) {
  const normalized = String(name).toLowerCase()
  if (normalized === 'main' || normalized === 'master' || normalized === 'trunk') return 6
  if (normalized === 'development' || normalized === 'develop' || normalized === 'dev') return 1
  return hashString(normalized) % PALETTE_SIZE
}

/** Pick the first free lane, or append one. */
function firstFree(lanes) {
  for (let index = 0; index < lanes.length; index += 1) {
    if (lanes[index] === null || lanes[index] === undefined) return index
  }
  return lanes.length
}

/** Choose the colour a new lane starts with from the refs on its commit. */
function laneColorFor(commit, refsByHash) {
  const refs = refsByHash.get(commit.hash) ?? []
  const head = refs.find(ref => ref.type === 'branch' && ref.isHead)
  if (head !== undefined) return colorIndexForBranch(head.name)
  const local = refs.find(ref => ref.type === 'branch')
  if (local !== undefined) return colorIndexForBranch(local.name)
  const remote = refs.find(ref => ref.type === 'remote')
  if (remote !== undefined) return colorIndexForBranch(remote.name)
  return 8
}

/** Palette slots handed to non-integration lanes, in order, so lanes differ. */
const LANE_PALETTE = [0, 1, 2, 3, 4, 5, 7, 8, 9]

/** Decorate refs for transport; branch refs reuse the lane colour. */
function decorateRefs(rawRefs, branchColor) {
  const order = ref => (ref.type === 'branch' && ref.isHead ? 0 : ref.type === 'branch' ? 1 : ref.type === 'remote' ? 2 : 3)
  return [...rawRefs]
    .sort((left, right) => order(left) - order(right) || left.name.localeCompare(right.name))
    .map(ref => ({
      name: ref.name,
      type: ref.type,
      isHead: ref.isHead === true,
      color: ref.type === 'branch' && branchColor.has(ref.name)
        ? branchColor.get(ref.name)
        : colorIndexForBranch(ref.name),
    }))
}

/** Integration branch names, in priority order: they own the centre lane. */
const INTEGRATION_NAMES = ['main', 'master', 'trunk']

/** Pick the integration branch: a conventional name, else the checked-out one. */
function pickIntegration(branchRefs) {
  for (const name of INTEGRATION_NAMES) {
    const match = branchRefs.find(ref => ref.name.toLowerCase() === name)
    if (match !== undefined) return match.name
  }
  const head = branchRefs.find(ref => ref.isHead === true)
  if (head !== undefined) return head.name
  return branchRefs.length > 0 ? branchRefs[0].name : null
}

/**
 * Visual column for a lane. The integration lane (0) is centred so its line
 * reads as the spine the other branches fork from; the rest fill the columns
 * around it in lane order.
 */
function columnForLane(lane, laneCount) {
  const mainColumn = Math.floor(laneCount / 2)
  if (lane === 0) return mainColumn
  let remaining = lane - 1
  let column = 0
  while (column < laneCount) {
    if (column === mainColumn) {
      column += 1
      continue
    }
    if (remaining === 0) return column
    remaining -= 1
    column += 1
  }
  return mainColumn
}

/**
 * Build the graph payload.
 *
 * Lanes are anchored to branches, not to traversal order: the integration
 * branch owns lane 0 (drawn in the centre) and every other branch keeps one
 * stable lane and colour for as long as it exists. That is why switching the
 * checked-out branch no longer reshuffles the graph.
 *
 * @param {Array<{hash: string; parents: string[]; author: string; email: string; time: number; subject: string}>} commits - newest first
 * @param {Array<{name: string; type: string; hash: string; isHead: boolean}>} refs
 * @returns {{rows: Array<object>; edges: Array<object>; laneCount: number; mainBranch: string | null; mainCol: number; headById: Record<string, string>}}
 */
export function buildGraph(commits, refs) {
  const refsByHash = new Map()
  for (const ref of refs) {
    if (!refsByHash.has(ref.hash)) refsByHash.set(ref.hash, [])
    refsByHash.get(ref.hash).push(ref)
  }

  const commitByHash = new Map(commits.map(commit => [commit.hash, commit]))
  const branchRefs = refs.filter(ref => ref.type === 'branch')
  const integration = pickIntegration(branchRefs)

  // Stable lane per branch: integration at 0, the rest alphabetically, so a
  // branch keeps its lane between refreshes and checkouts.
  const laneByName = new Map()
  if (integration !== null) laneByName.set(integration, 0)
  const otherNames = branchRefs
    .map(ref => ref.name)
    .filter(name => name !== integration)
    .sort((left, right) => left.localeCompare(right))
  let nextLane = integration === null ? 0 : 1
  for (const name of otherNames) {
    if (!laneByName.has(name)) laneByName.set(name, nextLane)
    nextLane += 1
  }

  // Which branches contain each commit, and how large each branch history is.
  const containing = new Map()
  const branchSize = new Map()
  for (const ref of branchRefs) {
    const lane = laneByName.get(ref.name)
    if (lane === undefined || !commitByHash.has(ref.hash)) continue
    const seen = new Set()
    const stack = [ref.hash]
    while (stack.length > 0) {
      const hash = stack.pop()
      if (seen.has(hash)) continue
      seen.add(hash)
      if (!containing.has(hash)) containing.set(hash, new Set())
      containing.get(hash).add(lane)
      for (const parent of commitByHash.get(hash).parents) {
        if (commitByHash.has(parent)) stack.push(parent)
      }
    }
    branchSize.set(lane, seen.size)
  }

  const integrationLane = integration === null ? null : 0

  // The integration branch spine is its first-parent chain: those commits keep
  // the centre lane even while side branches are merged in and out.
  const spine = new Set()
  if (integration !== null) {
    const tip = branchRefs.find(ref => ref.name === integration)
    let cursor = tip === undefined ? undefined : commitByHash.get(tip.hash)
    while (cursor !== undefined && !spine.has(cursor.hash)) {
      spine.add(cursor.hash)
      const first = cursor.parents[0]
      cursor = first === undefined ? undefined : commitByHash.get(first)
    }
  }

  /** Lane of the branch a commit belongs to: the spine, else the most specific branch. */
  function ownerLane(commit) {
    if (spine.has(commit.hash)) return integrationLane ?? 0
    const lanes = containing.get(commit.hash)
    if (lanes === undefined || lanes.size === 0) return null
    let best = null
    for (const lane of lanes) {
      if (best === null) {
        best = lane
        continue
      }
      const size = branchSize.get(lane) ?? Number.MAX_SAFE_INTEGER
      const bestSize = branchSize.get(best) ?? Number.MAX_SAFE_INTEGER
      if (size < bestSize || (size === bestSize && lane < best)) best = lane
    }
    return best
  }

  // Distinct palette slot per lane: hashing names collides (two branches can
  // share a colour), and the point of the graph is telling branches apart.
  const laneColor = new Map()
  const branchColor = new Map()
  if (integration !== null) {
    laneColor.set(0, 6)
    branchColor.set(integration, 6)
  }
  let paletteCursor = 0
  for (const [name, lane] of laneByName) {
    if (laneColor.has(lane)) {
      if (!branchColor.has(name)) branchColor.set(name, laneColor.get(lane))
      continue
    }
    const slot = LANE_PALETTE[paletteCursor % LANE_PALETTE.length]
    paletteCursor += 1
    laneColor.set(lane, slot)
    branchColor.set(name, slot)
  }

  const hints = new Map()
  const rows = []
  const rowByHash = new Map()

  for (const commit of commits) {
    if (rowByHash.has(commit.hash)) continue
    const lane = ownerLane(commit) ?? hints.get(commit.hash) ?? (integrationLane ?? 0)
    const color = laneColor.get(lane) ?? laneColorFor(commit, refsByHash)
    const row = rows.length
    rowByHash.set(commit.hash, { row, lane })
    rows.push({
      hash: commit.hash,
      row,
      lane,
      col: 0,
      color,
      parents: commit.parents,
      author: commit.author,
      email: commit.email,
      time: commit.time,
      subject: commit.subject,
      refs: [],
    })
    for (const parentHash of commit.parents) {
      if (!hints.has(parentHash)) hints.set(parentHash, lane)
    }
  }

  // Reserve a column for every branch, even one with no unique commit yet, so
  // merging a branch does not shift the columns of the other branches.
  let laneCount = Math.max(1, laneByName.size)
  for (const row of rows) laneCount = Math.max(laneCount, row.lane + 1)
  for (const row of rows) row.col = columnForLane(row.lane, laneCount)

  const edges = []
  for (const row of rows) {
    for (const parentHash of row.parents) {
      const target = rowByHash.get(parentHash)
      if (target === undefined) continue
      edges.push({
        fromRow: row.row,
        fromLane: row.lane,
        fromCol: row.col,
        toRow: target.row,
        toLane: target.lane,
        toCol: rows[target.row].col,
        color: row.color,
      })
    }
  }

  for (const row of rows) {
    const raw = refsByHash.get(row.hash)
    if (raw === undefined) continue
    row.refs = decorateRefs(raw, branchColor).slice(0, 6)
  }

  const headById = {}
  for (const ref of refs) {
    if (ref.type === 'branch' && ref.isHead) headById[ref.hash] = ref.name
  }

  return {
    rows,
    edges,
    laneCount,
    mainBranch: integration,
    mainCol: columnForLane(0, laneCount),
    branchColor,
    headById,
  }
}
