/**
 * The flat row-node union shared by the picker popup and the sidebar column.
 *
 * Both surfaces navigate the same three-tier tree — project → session → window
 * — with a single flat cursor. This module is the PURE builder for that ordered
 * node list so the two callers can't drift: `treeNodes` produces the union for a
 * given cursor/expansion policy, `findCursor` locates a cursor within it.
 *
 * The cursor is the `(pi, si, wi)` triple, where `si:-1` marks a project row and
 * `wi:-1` a session (or project) row — identical to the picker's original
 * inline `pickerNodes`.
 */

/** A flat cursor position: project index, session index (-1 = project row),
 *  window index (-1 = session/project row). */
export interface TreeCursor {
  pi: number;
  si: number;
  wi: number;
}

/** The minimal project shape the node builder needs — a structural subset of
 *  TeamProject so tests can pass plain fixtures. */
export interface TreeProjectLike {
  sessions: Array<{ windowList: readonly unknown[] }>;
}

/**
 * PURE — build the ordered flat node union for the tree.
 *
 * For every project a project row is emitted. Its sessions are expanded when the
 * project is the active one, OR always when `expandAllProjects` is set (the
 * sidebar shows the whole fleet; the picker only opens the active project).
 * Window rows are emitted only under the ACTIVE session (`pi===activeProject &&
 * si===activeSession`), so exactly one session's windows are ever expanded.
 */
export function treeNodes(
  projects: readonly TreeProjectLike[],
  activeProject: number,
  activeSession: number,
  opts: { expandAllProjects?: boolean } = {},
): TreeCursor[] {
  const expandAll = opts.expandAllProjects ?? false;
  const nodes: TreeCursor[] = [];
  projects.forEach((proj, pi) => {
    nodes.push({ pi, si: -1, wi: -1 });
    if (!expandAll && pi !== activeProject) return;
    proj.sessions.forEach((sess, si) => {
      nodes.push({ pi, si, wi: -1 });
      if (pi === activeProject && si === activeSession) {
        sess.windowList.forEach((_w, wi) => nodes.push({ pi, si, wi }));
      }
    });
  });
  return nodes;
}

/** PURE — index of `cursor` in `nodes`, or -1 when absent (e.g. after a refresh
 *  dropped the row). */
export function findCursor(nodes: readonly TreeCursor[], cursor: TreeCursor): number {
  return nodes.findIndex((n) => n.pi === cursor.pi && n.si === cursor.si && n.wi === cursor.wi);
}
