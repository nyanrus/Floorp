# 調査：新ワークスペースを Firefox ネイティブのタブグループで実装できるか

対象：Firefox 157 系（`floorp-runtime.lock.json` の build 157.0.1）。
根拠：リポジトリのコード（`tab-stacks/`、ランタイムパッチ、`workspaces/`）の読解。**Firefox 本体のソースは読んでいない**。Firefox 内部の挙動は、Floorp のコードが参照している範囲からの推測で、「未検証」と付けた。Web 検索では内部実装の資料は得られなかった（ユーザー報告のみ）。

## 結論

- **「ワークスペース＝タブグループ」にそのまま置き換えるのは不可。** 理由は §2。
- **ハイブリッドなら可能で、一部は得をする。** 所属は現行どおりタブ属性（または新方式）で持ち、ネイティブグループは「ワークスペース内の整理」と、「保存・復元（アーカイブ）」に使う。§3。
- いきなり設計に入らず、§5 の実験（PoC）で未検証の点を先に潰す。

## 1. ネイティブグループで分かっていること（コードからの事実）

| 項目 | 内容 | 根拠 |
|---|---|---|
| API | `gBrowser.tabGroups`、`group.label/collapsed/tabs/id/addTabs()`、`tab.group`、`removeTabGroup(group, {isUserTriggered:true})`、`ungroupTab`、`moveTabBefore/After`（グループも対象）、`adoptTab`、`tabGroupMenu.openEditModal(group)` | `tab-stacks/index.ts` |
| イベント | `TabGrouped`、`TabUngrouped`、`TabGroupCreate`、`TabGroupRemoved`、`TabGroupCollapse`、`TabGroupExpand`、`TabGroupUpdate` | `tab-stacks/index.ts:115-125`、`tab-refresh/controller.ts:211-217` |
| 永続化 | セッション状態に載る。ウィンドウ: `groups[]`（`id`）、`closedGroups[]`、タブ: `groupId`。ルート: `savedGroups[]`。閉じたグループは `tabs[].state` を持つ | ランタイムパッチ `tab-state-and-split-view.patch` の SessionStore 部 |
| ID | 文字列。再起動後も保たれると Floorp は仮定している（`floorp.tabstacks.groupKinds` のキー） | `tab-stacks/index.ts:53-61`。**テストは無い** |
| 閉じる | `removeTabGroup` は SessionStore にグループ全体を記録し、Ctrl+Shift+T で丸ごと復元される | `index.ts:373-384` のコメント |
| 保存グループ | 起動時の復元で、ネイティブが開いているグループを `savedGroups` に変える経路がある（`removeAfterRestore`） | SessionStore パッチ。`#prepDataForDeferredRestore` |
| 分割表示 | `tab-split-view-wrapper` はグループの中に入れられる | `index.ts:255`、`tabStacksNative.test.ts:125` |
| 色・名前 | 名前はプロパティ、色は CSS 変数（Floorp は色の setter を呼んでいない） | `styles.css:96, 137` |
| 型 | Gecko の型定義に `MozTabbrowserTabGroup` は無い。Floorp が自前で最小限の型を持つ | `@types/xul-window.d.ts:55` |

Floorp はすでに、ネイティブグループの上に「タブスタック」（2段のタブ列）を載せている。つまり**グループは今、ワークスペース内の整理に使われている**。これが最大の制約になる。

## 2. 「ワークスペース＝グループ」が成り立たない点

| # | 問題 | 詳細 |
|---|---|---|
| 1 | **入れ子にできない** | タブスタックが既にグループを使っている。Floorp 自身も「Move to Group」を隠して入れ子を避けている（`index.ts:472`）。ワークスペース内にスタックを作るにはグループが2段必要だが、Firefox 157 が入れ子に対応するかは**未検証**（Web 検索でも確認できず） |
| 2 | **非表示の方式が違う** | ワークスペースはネイティブの隠しタブ（`hidden` 属性、`gBrowser.hideTab`）で切り替える。折りたたみグループは CSS の可視性で隠すだけで、`hidden` にならない（`workspace-last-tab-test-utils.ts:189`）。折りたたみで代用するとタブ列の挙動、最後のタブ処理、`hasmultipletabs` 等が変わる |
| 3 | **コンテナ（`userContextId`）をグループが持てない** | 既定コンテナはワークスペースの核心機能。グループにこの属性は無い。別途ストアに持つ必要がある |
| 4 | **ウィンドウをまたげない** | グループは各ウィンドウに属する。ウィンドウ間でのグループ移動は Floorp に実装が無く、タブスタックの README も「タブ単位」と書く。Firefox 側にも未対応の報告がある（ユーザー報告） |
| 5 | **ピン留めとの相互作用** | ピン留めタブをグループの隣へ移すとグループに入る不具合の報告がある（Firefox 147.0.3 のユーザー報告）。Floorp 側に対処コードは無い |
| 6 | **同時に1つのグループにしか入れない** | 同じタブを複数ワークスペースに出す（Essential の実現）ができない |
| 7 | **グループ ID に依存すると、Floorp の外のデータとずれる** | ストアの ID（UUID）とグループ ID（Firefox 発行の文字列）を対応づける表が要る |
| 8 | **非公開・不安定な面が多い** | `_dragData`、`_endRemoveArgs` 等の非公開フィールドと、`display:contents` 前提の CSS に既に依存している（`tab-stacks` の調査）。さらにグループ依存を増やすと Firefox 更新で壊れる範囲が広がる |

## 3. 使えば得をする点（ハイブリッド案）

| 案 | 内容 | 利点 | リスク |
|---|---|---|---|
| **A. アーカイブに `savedGroups`／`closedGroups` を使う** | ワークスペースを閉じる/アーカイブするとき、その所属タブを一時グループにして `removeTabGroup` で閉じる。Firefox がタブ状態（履歴、スクロール位置等）を保存・復元してくれる | 現行のアーカイブ（`workspace-snapshot.ts` の自前のスナップショット）より状態の忠実度が高い見込み。履歴を含めて復元できる | `savedGroups` の保持期間・上限・消去条件が**未検証**。プロファイル単位で、ウィンドウに依存しない点は有利（ウィンドウは表示面、の原則に合う） |
| **B. ワークスペース内の整理はグループ（現状維持）** | タブスタックを今のまま使う。ワークスペースはタブ属性で分ける | 変更が最小。入れ子の問題が起きない | 属性方式の限界（SessionStore が正本）は残る |
| **C. ワークスペースの「実体」としての一時グループ** | 切り替え時だけ、所属タブをグループにまとめて管理する | ネイティブのグループ操作（ドラッグ、折りたたみ）を流用 | 切替のたびにグループを作り直すので、タブスタックと衝突する。**非推奨** |

推奨は **A + B**。

- 所属の正本は当面、現行どおり `floorpWorkspaceId`（SessionStore）。新仕様の段階 1〜4 とは矛盾しない。
- アーカイブの内部形式を、自前スナップショット → `savedGroups` ベースに替えられるかは、§5 の実験 4 の結果で決める。

## 4. 新仕様（`spec-next.md`）への影響

- §4.3「タブ所属」：変更なし。
- §5.1 のアーカイブ：実験 4 の結果次第で「内部形式」を差し替え可能にしておく（外部仕様は変えない）。
- §5.6 分割表示：分割はグループの中にも入れられる。ワークスペース切替で分割ラッパーとグループの両方を隠している現行の処理（`workspacesTabManager.tsx:426-454`）を、「グループの一部だけ別ワークスペース」の場合に壊さないようテストを足す。
- 対象外のまま：Essential、タブ所属のストア化。

## 5. 実験（PoC）の提案

どれもコードを変えずに、`deno task dev-tool eval` とテストで確かめられる。

| # | 確かめること | 方法 | 判断 |
|---|---|---|---|
| 1 | 入れ子 | `addTabGroup` で作ったグループの中に別グループを追加できるか | できなければ §2-1 は確定。できても、タブスタックとの二重利用は別途検討 |
| 2 | グループ ID の永続性 | グループを作って再起動し、`id` が同じか。ウィンドウ間（`adoptTab`）で保たれるか | 保たれなければグループ ID を鍵にする設計は不可 |
| 3 | 折りたたみ vs `hideTab` | 折りたたんだグループ内のタブが `hidden` か、選択・最後のタブ処理に影響するか | 現行の切替方式の代替になるか判断 |
| 4 | `savedGroups` | グループを閉じて保存 → 再起動 → 復元。履歴・コンテナ（`userContextId`）・分割・ピン留めが保たれるか。保持期間・上限、プライベートコンテナの扱い | アーカイブに使えるか判断 |
| 5 | 別ウィンドウへの移動 | タブスタック（グループ）を別ウィンドウへドラッグ。グループ・分割・`floorpWorkspaceId`・`floorpSplitViewGroupId` が残るか（仕様の T6 / #2567 の再現を兼ねる） | 既存の未検証点の解消 |
| 6 | ピン留めとグループ | ピン留めタブをグループの隣へ移したときの挙動（Firefox 147 の報告が 157 で直っているか） | Essential の将来設計に影響 |

## 6. 判断に必要だが未検証のこと（一覧）

- Firefox 157 の入れ子対応（§5 実験 1）。
- グループ ID の再起動後・ウィンドウ間の安定性（実験 2、5）。
- `savedGroups` の保持と上限、保存されるタブ状態の範囲（実験 4）。
- Firefox の `browser.tabs.groups.*` pref の有効値（Floorp は設定していない。ロックファイルに `browser.tabs.groups.alternateMenu` の記載があるのみ）。
- Firefox 本体のグループ実装の詳細（本調査では本体ソースを読んでいない。必要なら Searchfox で `MozTabbrowserTabGroup` と SessionStore を確認する）。

## 出典

- リポジトリ内：`browser-features/chrome/common/tab-stacks/`、`browser-features/chrome/common/workspaces/workspacesTabManager.tsx:384-455`、`.github/patches/floorp-runtime/common/tab-state-and-split-view.patch`、`tools/patches/`、`docs/workspaces/spec-current.md`、`spec-next.md`。
- 外部（ユーザー報告・要確認）：[Mozilla Connect: Ideas for enhancing the Firefox tab groups / containers experience](https://connect.mozilla.org/t5/discussions/ideas-for-enhancing-the-firefox-tab-groups-containers-experience/m-p/134778)、[Mozilla Discourse: tab group auto-joining after browser.tabs.move](https://discourse.mozilla.org/t/unexpected-tab-group-auto-joining-behavior-after-browser-tabs-move-call/147410)、[Firefox vertical tabs](https://www.firefox.com/en-US/features/vertical-tabs/)。
