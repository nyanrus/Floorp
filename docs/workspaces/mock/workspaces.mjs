// ワークスペース中核ロジックの JS + JSDoc 版（workspaces.jl と同じ振る舞い）
// 実行: node workspaces.mjs

/**
 * @typedef {{ name: string, userContextId: number, icon: string | null }} Workspace
 * @typedef {{
 *   schemaVersion: number,
 *   defaultId: string,
 *   data: Map<string, Workspace>,
 *   order: string[],
 * }} Store
 * @typedef {{
 *   workspaceId: string | null,
 *   pinned: boolean,
 *   essential: boolean,
 *   selected: boolean,
 * }} Tab
 * @typedef {{ exitOnLastTabClose: boolean, stayOnLastTabClose: boolean }} Settings
 * @typedef {
 *   | { type: "switch", workspaceId: string }
 *   | { type: "keep" }
 *   | { type: "close-window" }
 * } CloseAction
 */

// ---------- ① ストアの読み込み ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {string} s */
const cleanId = (s) => s.replace(/[{}]/g, "");
/** @param {string} s */
const validId = (s) => UUID_RE.test(cleanId(s));

/**
 * v4（schemaVersion なし）も v2 も読める。壊れていれば null。
 * @param {{
 *   schemaVersion?: number,
 *   defaultID: string,
 *   data: Array<[string, { name: string, userContextId?: number, icon?: string | null }]>,
 *   order: string[],
 * }} raw
 * @returns {Store | null}
 */
export function decodeStore(raw) {
  const version = raw.schemaVersion ?? 4;
  if (version > 2 && version !== 4) return null;

  /** @type {Map<string, Workspace>} */
  const data = new Map();
  for (const [id, w] of raw.data) {
    if (!validId(id)) return null;
    data.set(cleanId(id), {
      name: w.name,
      userContextId: w.userContextId ?? 0,
      icon: w.icon ?? null,
    });
  }
  const order = raw.order.map(cleanId);
  const defaultId = cleanId(raw.defaultID);

  if (!data.has(defaultId)) return null;
  if (!order.every((id) => data.has(id))) return null;
  return { schemaVersion: 2, defaultId, data, order };
}

// ---------- ② 表示判定 ----------

/**
 * Essential は pinned のうち印の付いたもの。Firefox の hideTab は pinned を拒否する。
 * @param {Tab} t
 */
export const isEssential = (t) => t.pinned && t.essential;

/**
 * 隠すべきか。pinned・選択中は Firefox が隠せないので常に false。
 * @param {Tab} t
 * @param {string} current
 */
export function shouldHide(t, current) {
  if (t.pinned || t.selected) return false;
  return t.workspaceId !== null && t.workspaceId !== current;
}

/**
 * @param {Tab[]} tabs
 * @param {string} current
 * @returns {number[]}
 */
export const hiddenTabs = (tabs, current) =>
  tabs.flatMap((t, i) => (shouldHide(t, current) ? [i + 1] : [])); // Julia に合わせ 1 始まり

// ---------- ③ 最後のタブを閉じたとき ----------

/**
 * そのワークスペースの通常タブ数（Essential は数えない）。
 * @param {Tab[]} tabs
 * @param {string} ws
 */
const countRegular = (tabs, ws) =>
  tabs.filter((t) => !isEssential(t) && t.workspaceId === ws).length;

/**
 * @param {Tab[]} tabs
 * @param {string} current
 * @param {Settings} s
 * @param {string[]} order
 * @returns {CloseAction | null} まだタブが残っていれば null
 */
export function onLastTabClosed(tabs, current, s, order) {
  if (countRegular(tabs, current) > 0) return null;

  if (s.stayOnLastTabClose) return { type: "keep" };

  const others = order.filter((w) => w !== current && countRegular(tabs, w) > 0);
  if (others.length === 0) {
    return s.exitOnLastTabClose ? { type: "close-window" } : { type: "keep" };
  }
  if (s.exitOnLastTabClose) return { type: "close-window" };
  return { type: "switch", workspaceId: others[0] };
}

// ---------- テスト ----------

import assert from "node:assert/strict";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

{
  const v4 = {
    defaultID: `{${A}}`,
    data: [[A, { name: "仕事", userContextId: 1 }], [B, { name: "私用" }]],
    order: [A, B],
  };
  const s = decodeStore(v4);
  assert.equal(s?.schemaVersion, 2);
  assert.equal(s?.data.get(B)?.userContextId, 0);
  assert.equal(decodeStore({ ...v4, defaultID: "x" }), null);
  assert.equal(decodeStore({ ...v4, schemaVersion: 9 }), null);
}

{
  /** @type {Tab[]} */
  const tabs = [
    { workspaceId: A, pinned: false, essential: false, selected: false },
    { workspaceId: B, pinned: false, essential: false, selected: false },
    { workspaceId: B, pinned: true, essential: true, selected: false },
    { workspaceId: B, pinned: false, essential: false, selected: true },
  ];
  assert.deepEqual(hiddenTabs(tabs, A), [2]);
}

{
  /** @type {Tab[]} */
  const tabs = [
    { workspaceId: B, pinned: false, essential: false, selected: false },
    { workspaceId: A, pinned: true, essential: true, selected: false },
  ];
  assert.deepEqual(
    onLastTabClosed(tabs, A, { exitOnLastTabClose: false, stayOnLastTabClose: false }, [A, B]),
    { type: "switch", workspaceId: B },
  );
  assert.equal(
    onLastTabClosed(tabs, A, { exitOnLastTabClose: false, stayOnLastTabClose: true }, [A, B])?.type,
    "keep",
  );
  assert.equal(
    onLastTabClosed(tabs, A, { exitOnLastTabClose: true, stayOnLastTabClose: false }, [A, B])?.type,
    "close-window",
  );
}

console.log("ok");
