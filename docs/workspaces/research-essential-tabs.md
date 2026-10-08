# 調査：Essential（全ワークスペース共通の固定タブ）の実現性

対象：Firefox 157.0.1。
読んだ版：`mozilla-firefox/firefox` のタグ `FIREFOX_157_0_1_RELEASE`（commit `0c469c2352451630bc69fc328c9f0c589c6c534d`）。`main` は未確認。
方法：searchfox.org がネットワークポリシーで遮断されていたため、loka の `fetch_url` 経由で GitHub のミラー（`api.github.com`）から読んだ。行番号は `browser/components/tabbrowser/Tabbrowser.sys.mjs` のもの。**コードを読んだだけで、実機では確認していない。**

## 結論

**1ウィンドウ内の Essential は実現可能。Firefox 本体へのパッチはほぼ不要。**
「全ウィンドウで同じタブを共有する」Essential は不可能（タブは1つのウィンドウにしか属せない。`setSuccessor` が他ウィンドウのタブで例外を投げる、L10112-10118）。

## 推奨案：Essential ＝ pinned ＋ マーカー

`hideTab` は `aTab.hidden || aTab.pinned || aTab.selected || aTab.closing || webRTC共有中` のとき即 return する（L7535-7611）。つまり**ピン留めタブは隠せず、現行のワークスペース切替（`workspacesTabManager.tsx:410-424` の全タブへの `hideTab`）でも、ピン留めタブは今も全ワークスペースで見えている**。

そこで Essential を「ピン留めタブ＋ `floorpEssential` マーカー」とする。

| 項目 | 内容 |
|---|---|
| 常時表示 | pinned は `hideTab` が拒否するので、追加の処理なしで全ワークスペースに出る |
| 配置 | pinned は専用コンテナ `#pinned-tabs-container` の先頭に並ぶ（L1246 `pinTab`）。縦・横タブのどちらでも同じ。Zen/Arc 的な「先頭固定」が自動で得られる |
| 保存 | `SessionStore.setCustomTabValue(tab, "floorpEssential", "1")`（`extData`、文字列のみ）。ウィンドウ内のタブ入れ替え時は `#moveCustomTabValue` が移送する。ランタイムパッチは不要 |
| 通常のピン留めとの区別 | マーカーの有無。区別して並べるのは Floorp 側の処理 |

案B（非 pinned ＋カスタム属性のみ）は、`updateTabsVisibility` で Essential だけ `showTab` すれば動くが、先頭に固定されず、ワークスペースのタブと混ざる。推奨しない。

## 確認できた制約（Firefox 157.0.1）

| 項目 | 事実 |
|---|---|
| ピン留めの順序 | `moveTabTo`（L7879-）は pinned を `min(idx, pinnedCount-1)`、非 pinned を `max(idx, pinnedCount)` にクランプ。`#moveTabNextTo`（L8033-）も混在を禁じる。pinned 同士の並びは自由なので、通常のピン留めと Essential の順序は Floorp が整える必要がある |
| `pinnedTabCount` | `tabs` の先頭から連続する pinned の数（L592） |
| ピン留めの範囲 | ウィンドウ内の属性。ウィンドウ横断の概念はない |
| 選択・後継 | `_findTabToBlurTo`（L7013）は `visibleTabs`（`!hidden` かつグループ内で可視）から選ぶ。pinned は常に visible |
| Ctrl+Tab | `browser-ctrlTab.js` は `hidden && !selected` を除外する。Essential（pinned）は含まれる |
| セッション | `TabAttributes` の永続属性は `customizemode` のみ。任意の DOM 属性は保存されないので、`extData`（`setCustomTabValue`）か、既存の `TabState` への注入（`floorpWorkspaceId` と同じ方式）が必要 |
| タブの重複 | `duplicateTab` は `pinned = false` にする（L3758）。`extData` は引き継がれる可能性がある（要確認） |

## リスク

1. **見分けと並び順**：通常のピン留めと Essential の混在。`moveTabTo` は混在を許すので、Floorp 側で並べ直す。
2. **`floorpWorkspaceId` の扱い**：Essential に所属 ID を付けるか。付けると `workspace-last-tab.patch` の「他ワークスペースの隠れタブがあればウィンドウを閉じない」判定や、`handleTabClose` の「ワークスペースが空」判定に影響する。付けない場合の自動割り当て（`TabOpen` で選択中ワークスペースを付ける）との整合も決める。
3. **ピン留めがグループに入りうる**：`#insertTabAtIndex`（L5340-5515）の `if (tabGroup)` 分岐に pinned のガードが見当たらない。`adoptTab`（L8388）が `tabGroup: nextElement.group` を渡し、`pinned` のまま `tabGroup.appendChild(tab)` に至る経路がありうる。Firefox 147 の「pinned タブがグループに入る」報告の原因候補。**静的な推論で、実機未確認**。任意で `!pinned` ガードを足すパッチが選べる。
4. **別ウィンドウへ移すと独自属性が落ちる**：`swapBrowsersAndCloseOther`（L7106-）は `muted`、`discarded`、`usercontextid` 等だけを引き継ぐ。`pinned` は挿入位置から再計算される。`floorpEssential` は `extData`、または `TabOpen` の `detail.adoptedTab` からコピーする必要がある。
5. **未確認の面**：拡張機能 `tabs.hide`、縦タブ／サイドバーの CSS、「全タブ一覧」の `filterFn`（`browser-allTabsMenu.js`）は未読。

## 触る関数（最小）

- Floorp 側：Essential の作成/解除（`pinTab` ＋ `setCustomTabValue`）、`updateTabsVisibility` の分岐、並び順の調整、ウィンドウ間移動時の属性コピー。
- ランタイムパッチ：原則なし（`extData` を使う場合）。堅牢化として `#insertTabAtIndex` の `!pinned` ガードは任意。

## 新仕様への影響

- `spec-next.md` の §9「対象外」から、Essential を**別段階の候補**に戻せる。ウィンドウ共有はしない、と明記する。
- 上限数（未決）は、先頭の固定行のスペースに直結する。
- §5.4 の「ピン留めタブはワークスペースに属する」現行の記述は誤り。現行コードではピン留めタブは隠れないので、`spec-current.md` §4.7 も要訂正（下記）。

## 訂正が必要な既存記述

`spec-current.md` §4.7 は「ピン留めタブは他のワークスペースでは隠れる」と書いたが、`hideTab` が pinned を拒否するため、**実際には隠れない**。静的な読みなので、実機での確認（`deno task dev-tool eval`）が先に必要。

## 実機で確かめること

1. ピン留めタブがワークスペース切替で本当に残るか。
2. `setCustomTabValue` の値が再起動・同ウィンドウ内の移動で残るか。
3. ピン留めタブをグループの隣へ移したときの挙動（リスク3）。
4. ピン留めタブを別ウィンドウへ移したときの `extData`。
5. `floorpWorkspaceId` を Essential に付けたときの最後のタブ処理。
