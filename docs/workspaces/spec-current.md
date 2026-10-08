# 現行ワークスペース仕様書（実装記録つき）

対象：Floorp のワークスペース機能の**現在の実装**と、過去の形式（旧 pref・旧ファイル）の記録。
根拠：`browser-features/chrome/common/workspaces/` ほかのコード調査（行番号は調査時点）。
注意：リポジトリの git 履歴は浅く（約 281 コミット）、各形式がいつ導入されたかはコミットから追えない。導入時期は「不明」と書く。実行時の挙動は、コードを読んだだけで実機で確認していないものに「未検証」と付けた。

---

## 1. 構成

### 1.1 チャローム側（SolidJS）`browser-features/chrome/common/workspaces/`

| ファイル | 役割 |
|---|---|
| `index.ts` | `Workspaces` コンポーネント。ウィンドウごとの `WeakMap<Window, WorkspacesService>`（67-74行）。`init()`（76-129行）で `migrateWorkspacesData()` を実行してからマネージャを構築 |
| `workspacesService.ts` | 公開 API。`globalThis.workspacesFuncs` に公開（116-131行） |
| `workspacesTabManager.tsx` | タブの所属付け、表示/非表示、最後のタブ処理、切り替え |
| `workspacesDataManagerBase.tsx` | CRUD、選択 ID・既定 ID の回復ロジック |
| `data/data.ts` | ストアの pref 読み書き（185-246行） |
| `data/config.ts`、`data/old-config.ts` | 設定の pref 読み書き、旧設定の取り込み |
| `data/migrate/{migration,old_type}.ts` | 11.x のファイルからの移行 |
| `utils/type.ts` | io-ts のコーデック |
| `utils/workspaces-static-names.ts` | pref 名・属性名・オブザーバトピックの定数 |
| `utils/workspaces-archive-service.ts` | アーカイブ（ファイル） |
| `utils/workspace-snapshot.ts` | スナップショットの取得 |
| `utils/tab-replacement-lifecycle.ts`、`explicit-tab-user-context.ts` | 置換タブの追跡、明示コンテナ指定 |
| UI | `workspace-modal.tsx`、`toolbar/*`、`contextMenu/*`、`tabContextMenu.tsx`、`link-context-menu.tsx`、`icons/*` |

### 1.2 そのほかのチャローム側

- `browser-features/chrome/static/overrides/modules/workspaces/{index,open-link-user-context,clipboard}.ts`：`openTrustedLinkIn`、`openUILinkIn`、`BrowserCommands.openTab` の上書き。
- `browser-features/chrome/common/ui-custom/layout/dom-manipulator.ts:690-730`：ブックマークのコンテナ決定。
- `browser-features/chrome/common/command-palette/`：`utils/containerChoices.ts`、`utils/targetContext.ts`、`multiInputCommand/{open-url,search-web}.ts`、`multiInputCommand/switcher/bookmark-switcher.ts`、`controller.ts:1828`。
- `browser-features/chrome/common/context-menu/adapters/floorp.ts:59-94`、`mouse-gesture/utils/actions.ts:500-508`。
- `browser-features/chrome/common/tab-stacks/`：ネイティブのタブグループの表示層。ワークスペースで隠れたタブを数えない（`index.ts:179-190`、`stack-bar.tsx:104-146`）。

### 1.3 親プロセス（`.sys.mts`）

- `browser-features/modules/actors/NRWorkspacesParent.sys.mts` / `NRWorkspacesChild.sys.mts`：`NRWorkspaces:Initialize` をオブザーバトピック `floorp.workspaces.initialize` に中継。登録は `BrowserGlue.sys.mts:242`。
- `browser-features/modules/modules/os-apis/workspaces/WorkspacesApiService.sys.mts` と `os-server/workspaces/{routes.sys.mts,types.ts}`：ストア pref を直接読み、`win.workspacesFuncs` を呼ぶ。
- `browser-features/modules/modules/NoranekoStartup.sys.mts:188-250`：`workspacesFuncs` を待ち、リリースノートのタブに `floorpWorkspaceId` を付ける。

### 1.4 設定ページ（React）

`browser-features/pages-settings/src/app/workspaces/{page.tsx,dataManager.ts,components/BasicSettings.tsx,components/BackupSettings.tsx}`。フォーム型は `src/types/pref.ts:87-96`。

### 1.5 ランタイムパッチ（Firefox 本体への差分）

2 系統が並存する。**両方を同時に直す必要がある**。
- ローカルビルド用：`tools/patches/`
- パッケージ用：`.github/patches/floorp-runtime/common/`

| パッチ | 内容 |
|---|---|
| `workspace-last-tab.patch` | 最後に見えているタブを閉じるとき、別ワークスペースの隠れタブが残っていればウィンドウを閉じない。`floorp.workspaces.enabled` で有効化 |
| `workspace-external-containers.patch` | `BrowserContentHandler.sys.mjs` に `getWorkspaceUserContextIdForExternalOpen` を追加。外部リンクのコンテナを決める |
| Tabbrowser / SessionStore / TabState | タブの保存・復元に `floorpWorkspaceId` などを載せる（§5.2） |

## 2. 現行データ形式（v4）

### 2.1 ストア pref

- 名前：`floorp.workspaces.v4.store`（文字列 pref、JSON）。
- スキーマ（`utils/type.ts:9-34`）：

```
{
  defaultID: UUID,                      // 既定のワークスペース
  data: [[UUID, Workspace], ...],       // Map をペア配列で保存（data.ts:187-190, 220-222）
  order: [UUID, ...]                    // 表示順
}

Workspace {
  name: string
  userContextId: number                 // 0 = コンテナなし
  isSelected: boolean | null | undefined   // 事実上使われない
  isDefault: boolean | null | undefined    // 事実上使われない（正本は defaultID）
  icon?: string | null
}
```

- UUID は小文字/大文字の 16 進、波括弧なし。
- `schemaVersion` は無い。版は pref 名の `v4` だけ。
- 書き込み：Solid の `createEffect` が、ストアが変わるたびに `Services.prefs.setStringPref` を呼ぶ（`data/data.ts:216-224`）。明示的なフラッシュや間隔はなく、`prefs.js` への書き出しは Firefox の標準動作に任せる。
- 読み込み：pref オブザーバが外部変更をストアに戻す（226-246行）。デコードに失敗したら無視する。
- 壊れた・空のストア：`getDefaultStore()` が既定 ID `0000…0000`、空の Map、空の順序を返す（185-207行）。その後 `WorkspacesService` が「New Workspace (0)」を作る（`workspacesService.ts:133-137`）。
- 選択中ワークスペースはストアに入れない（`data.ts:261-274` のコメント）。ウィンドウごとの signal。

### 2.2 設定 pref

- 名前：`floorp.workspaces.v4.config`（JSON 文字列）。
- 項目（`zWorkspacesServicesConfigs`、`type.ts:61-66`）：

| キー | 意味 | `old-config.ts` の既定 | 設定ページ（`dataManager.ts:115-120`）の既定 |
|---|---|---|---|
| `manageOnBms` | ブックマークをワークスペースで管理 | false | 要確認 |
| `showWorkspaceNameOnToolbar` | ツールバーにワークスペース名を表示 | **true** | **false** |
| `closePopupAfterClick` | クリック後にポップアップを閉じる | **false** | **true** |
| `exitOnLastTabClose` | 最後のタブを閉じたらウィンドウを閉じる | false | 要確認 |

- 太字の 2 項目は、設定ページとチャローム側で既定値が食い違っている（実際に効く既定は、pref が未設定のとき `old-config.ts` の値が使われる側。ページ側の表示値と一致しない可能性がある。**未検証**）。
- 読み込み順：旧 pref の値 → `v4.config` の値で上書き → io-ts でデコード。失敗時は項目ごとに型を見て、旧値へフォールバック（`data/config.ts:35-85`）。
- 書き込み：`createEffect` が `{...configStore}` を保存（96-109行）。過去に `unwrap()` が依存を追跡せず、`setConfigStore()` が保存されない不具合があった。現在は展開して直っている。設定ページは pref を直接書き、オブザーバが戻す。

### 2.3 そのほかの pref・定数（`workspaces-static-names.ts`）

| 名前 | 種類 | 内容 |
|---|---|---|
| `floorp.workspaces.enabled` | bool pref | 機能の有効/無効。コード上の既定は `true`（`data/config.ts:32`）。`static/gecko/pref/override.ini` には無い。変更には再起動が必要 |
| `floorp.workspaces.pending-exit-from-workspace-empty` | bool pref（一回限り） | 空のワークスペースで終了した印。次回起動で重複した新規タブを畳む |
| `floorp.workspaces.initialize` | オブザーバトピック | 初期化（リセット）要求 |
| `floorp.workspaces.changed` | オブザーバトピック | ワークスペース変更通知。データは ID。OS サーバが転送（`os-server/browser/routes.sys.mts:112`） |
| `floorpWorkspaceId` | タブ属性 | タブの所属 |
| `floorpWorkspaceLastShowId` | タブ属性 | そのワークスペースで最後に見ていたタブの印（ワークスペースごとに 1 つ） |
| `floorp.extensions.STG.like.floorp.workspaces.enabled` | bool pref | CSS オプション（`designs/configs.ts:111`） |

関連する Firefox 側の pref：`browser.startup.page`（既定 3、`override.ini:19`）、`browser.tabs.closeWindowWithLastTab`、`privacy.userContext.enabled`、`browser.link.force_default_user_context_id_for_external_opens`、`floorp.browser.tabs.openNewTabPosition`。

### 2.4 アーカイブ（ファイル）

- 場所：`<ProfD>/workspaces/archive/<uuid>.json`。`IOUtils.writeJSON` で書く。
- 形式：`{ version: 1, snapshot }`（`workspaces-archive-service.ts:12, 56, 80-87, 149`）。ワークスペース関連で `version` を持つのはここだけ。
- スナップショット（`zWorkspaceSnapshot`、`type.ts:78-91`）：`capturedAt`、`workspace {workspaceId, name, userContextId, icon?}`、`tabs [{state, title, url, pinned, isSelected, userContextId, lastShownWorkspaceId}]`。
- 復元：`restoreTabsFromSnapshot`（`workspacesService.ts:506-591`）が、保存されたタブごとの `userContextId` を使う。

### 2.5 バックアップ関連の未使用コード

`zWorkspaceBackup*`（`type.ts:36-59`）は参照されていない。設定ページの `BackupSettings` は `page.tsx:281` でコメントアウトされ、i18n に `backupComingSoon` がある。

## 3. 過去の形式の記録

### 3.1 Floorp 11 以前：`<ProfD>/Workspaces/Workspaces.json`

型は `data/migrate/old_type.ts`。

```
Floorp11Workspaces {
  windows: {
    <ウィンドウキー>: {
      <キー>: WorkspaceDetail | preferences
    }
  }
}

WorkspaceDetail {
  name: string
  tabs: unknown[]
  defaultWorkspace: boolean
  id: string                  // 波括弧つきの場合あり
  icon: string | null
  userContextId?: number
  isPrivateContainerWorkspace?: boolean
}

preferences (キー名 "preferences") {
  selectedWorkspaceId?: string
  defaultWorkspace?: string
}
```

特徴：ウィンドウごとにワークスペースが入っていた。ID は `{uuid}` 形式のことがあった。タブの一覧を持っていた。

### 3.2 旧設定 pref（`floorp.browser.workspace.*`）

`data/old-config.ts` が今も読む。

| 旧 pref | 現行のキー | 旧既定 |
|---|---|---|
| `floorp.browser.workspace.manageOnBMS` | `manageOnBms` | false |
| `floorp.browser.workspace.showWorkspaceName` | `showWorkspaceNameOnToolbar` | true |
| `floorp.browser.workspace.closePopupAfterClick` | `closePopupAfterClick` | false |
| `floorp.browser.workspace.exitOnLastTabClose` | `exitOnLastTabClose` | false |

注意：旧 pref は読むだけで、消さない。`v4.config` が未設定のときの初期値として使われる。

### 3.3 移行処理（`data/migrate/migration.ts`）

- 実行：**ウィンドウの初期化のたびに**走り、ファイルが無ければ何もしない。
- 手順：
  1. 開いている全ウィンドウのタブから `floorpWorkspaceId` を集める（波括弧を除いて UUID として検証）。
  2. `Workspaces.json` を読み、io-ts で検証する。
  3. **生きているタブが使っている ID のワークスペースだけ**を移行する（163-193行、254行）。使われていないものは捨てる。
  4. 既定 ID は、(a) `defaultWorkspace: true` の最初のもの、(b) `preferences` の `selectedWorkspaceId`/`defaultWorkspace`、(c) 順序の先頭、の順に選ぶ。
  5. ストアを置き換え、旧ファイルを**削除**する（317行）。
- 注意：移行後は 11.x の元データが残らない。「使われていないワークスペースは移行されない」ため、元の定義が失われうる。

### 3.4 世代の整理

| 世代 | 保存先 | 版の判定 | 備考 |
|---|---|---|---|
| 11.x 以前 | `Workspaces/Workspaces.json` | ファイルの形 | 移行後に削除 |
| 12.x 前後（導入時期は不明） | `floorp.workspaces.v4.store` | pref 名 `v4` | 現行 |

12.x 以前に `v1`〜`v3` の pref が存在したかどうかは、リポジトリから確認できなかった（`grep` で `.v1`〜`.v3` の参照なし）。

## 4. 動作

### 4.1 タブの所属付け

- `TabOpen` で 2 つのリスナが動く：`workspacesTabManager.tsx:367-382` と `workspacesService.ts:612-646`。後者は `SessionStore.promiseAllWindowsRestored` の後にだけ登録される（187-193行。復元タブの誤付与を避ける、issue 2343）。
- 属性が無い、または ID がストアに無いタブには、ウィンドウの選択中ワークスペース（なければ既定）を割り当てる（`getWorkspaceIdFromAttribute`、462-482行）。波括弧は除いて検証する。

### 4.2 表示・非表示

`updateTabsVisibility()`（`workspacesTabManager.tsx:384-455`）が、属性の一致でタブごとに `gBrowser.showTab` / `hideTab` を呼ぶ。つまりタブは Firefox のネイティブの「隠しタブ」。所属するタブが 1 つも無いタブグループと `tab-split-view-wrapper` は `display: none` にする（426-454行）。

### 4.3 起動時

`initializeWorkspace`（`workspacesTabManager.tsx:56-79, 102-186`）は `promiseAllWindowsRestored` の後に動き、次の順で選択中ワークスペースを決める：選択中タブの所属 → 先頭 10 個の見えているタブの多数決 → `defaultID`。ワークスペース側は `browser.startup.page` を参照しない。既定が 3（前回のセッション）なので、復元は SessionStore が担う。

### 4.4 切り替え（`changeWorkspace`、663-791行）

1. 直前のワークスペースの「最後に見たタブ」の印を保存する。古い印は先に消す（issue 2616）。
2. 選ぶタブの優先順：現在のタブが対象に属していればそれ → 最後に見たタブ → 対象の先頭のタブ → 未所属のタブ、または `createTabForWorkspace` で作る新規タブ。
3. 選択 ID を更新し、表示を更新する。

`floorp.workspaces.changed` を通知する。ウィンドウ間のフォーカス移動や自動切替は無い。ウィンドウごとに独立して選べる。

そのほかの切り替え契機：選択中のタブを別ワークスペースへ移したとき（`switchToAnotherWorkspaceTab`、なければ既定へ）、現在のワークスペースを削除したとき（既定または代替へ）、`location-change` 時の表示更新（`workspacesService.ts:596-604`）。

### 4.5 最後のタブを閉じたとき（`handleTabClose`、199-365行）

- 現在のワークスペースが空になり、他に空でないワークスペースがある場合：
  - `exitOnLastTabClose` オフ：他ワークスペースの先頭のタブへ**自動で切り替え**、ウィンドウは残す。
  - オン：置換タブを残し、`pending-exit` pref を立てて `setTimeout(close, 0)` でウィンドウを閉じる。他ワークスペースの隠れタブは閉じたウィンドウの SessionStore に残る。
- 他にタブが無い場合：オフなら、ワークスペースのコンテナで置換タブを作る。オンならウィンドウを閉じる。
- `exitOnLastTabClose` が効くのは `browser.tabs.closeWindowWithLastTab` が true のときだけ（242行）。
- ランタイムパッチ `workspace-last-tab.patch` により、見えている最後のタブを閉じても、別の `floorpWorkspaceId` の隠れタブがあればウィンドウは閉じない。
- 一括削除中は `suppressTabCloseHandling` で処理を止める（issue 2247）。
- ネイティブの置換タブは Firefox の非公開フィールド `_endRemoveArgs[1]` で追跡している（`tab-replacement-lifecycle.ts`）。Firefox の更新で壊れやすい。

### 4.6 コンテナ（`userContextId`）の決まり方

既定の入口は `getCurrentWorkspaceUserContextId()`（`workspacesService.ts:222-225`）：選択中ワークスペースの `userContextId`、なければ 0。

| # | 経路 | 動作 |
|---|---|---|
| 1 | 新規タブ（Ctrl+T、「+」） | `BrowserCommands.openTab` の上書き（`overrides/.../index.ts:142-255`）が `userContextId` を付ける（209-210行） |
| 2 | `openTrustedLinkIn` | 上書き（17-102行）。`about:` は対象外。`where === "current"` には付けない。ワークスペースのコンテナが 0 より大きく、`options.userContextId` も `targetBrowser.userContextId` も無いときだけ付ける（`open-link-user-context.ts:18-67`） |
| 3 | `openUILinkIn` | 上書き（106-140行）。同じ解決関数 |
| 4 | アドレスバー | 専用コードなし。2・3 に依存。**全経路が通るかは未検証** |
| 5 | コマンドパレット | URL を開く（`open-url.ts:143-192`）：「workspace」（既定）/ 「0」/ 明示 ID。明示指定は `withExplicitTabUserContext` 経由。ブックマーク切替（`bookmark-switcher.ts:241-260`）、Web 検索（`search-web.ts:176`）、`controller.ts:1828` は `workspaceUserContextId` を使う。選択肢は `containerChoices.ts`（「ワークスペース既定」「コンテナなし」「公開コンテナ」） |
| 6 | ブックマーク | `getBookmarkWorkspaceUserContextId`（`dom-manipulator.ts:690-730`）。プライベートウィンドウ、`privacy.userContext.enabled` オフ、存在しない identity なら 0 |
| 7 | リンクの右クリック「別のワークスペースで開く」 | 対象ワークスペースの `userContextId`（`link-context-menu.tsx:231-250`） |
| 8 | 置換・空ワークスペース用タブ | `createTabForWorkspace`（`workspacesTabManager.tsx:627-657`）。`browsingContext.originAttributes` で検証 |
| 9 | 外部リンク（OS から、コールドスタート、新規ウィンドウ） | `workspace-external-containers.patch`。ウィンドウ準備済みなら `getCurrentWorkspaceUserContextId()`、未準備なら pref `floorp.workspaces.v4.store` の `defaultID` を直接読む。`browser.link.force_default_user_context_id_for_external_opens` が true、プライベートウィンドウ、機能無効、`privacy.userContext.enabled` オフ、または公開 identity でないなら 0。`BrowserDOMWindow.sys.mjs` は「推測 0」と「推測なし (null)」を区別 |
| 10 | スナップショット復元 | 保存されたタブごとの値 |
| 11 | `TabOpen` | コンテナを決めない（ブラウザ作成前に決める必要があるため。`workspacesService.ts:608-611` のコメント） |

### 4.7 固定タブ・Essential

- ピン留めタブに特別扱いは無い。他のタブと同じく `floorpWorkspaceId` を持ち、他のワークスペースでは隠れる。
- Essential（全ワークスペース共通の固定）の概念は存在しない。

### 4.8 分割表示とタブスタック

- 分割ペインは `floorpSplitViewGroupId` 属性を持つタブ（`split-view/data/types.ts:126`）。TabState パッチで保存される。
- ワークスペース側は、子タブの 1 つも現在のワークスペースに属さない `tab-split-view-wrapper` だけを隠す。全ペインが同じワークスペースに属することは強制しない。`split-view/` 側はワークスペースを認識しない。
- `openTrustedLinkIn` の上書きに `about:opentabs` 用の分割表示の特例がある（28-72行）。SessionStore パッチは、プライベートコンテナの整理の過程で 2 タブ未満の分割を落とす。
- 別ウィンドウへ移したときの扱い：`adoptTab` / `swapBrowsers` / 移動イベントの処理は見つからなかった。属性が移動先に残るかは**未検証**。残らなければ移動先の現在のワークスペースが付き、残れば同じ ID としてそのまま受け入れられる。

## 5. 保存と復元

### 5.1 ワークスペース定義
ストア pref（§2.1）。プロファイル単位で全ウィンドウが共有し、オブザーバで同期する。

### 5.2 タブ所属
SessionStore。`TabState.sys.patch` の `/*@nora:inject:start*/` 部が、`floorpWorkspaceId`、`floorpLastShowWorkspaceId`、`floorpDisableHistory`、`floorpSplitViewGroupId` をタブ状態へ書く。Tabbrowser パッチが復元時に属性を戻す（既存タブ再利用の経路も含む）。復元タブに `floorpWorkspaceId` が無い場合、実行時に `floorp.workspaces.v4.store` を直接パースして `defaultID` を使う。つまり**ランタイムが pref 形式に依存している**。

- `SessionStore.persistTabAttribute` は、あれば呼ぶ（Firefox 152 以降で削除されたため）。`workspacesService.ts:139-169`。
- プライベートコンテナのプレースホルダタブは復元時に整理する。

### 5.3 ウィンドウを閉じる・終了
- `quit-application`、ウィンドウクローズ、unload のオブザーバは `workspaces/` に無い。
- 隠れタブは閉じたウィンドウの SessionStore に残る。
- `floorp.workspaces.initialize` のオブザーバは `resetWorkspaces()` を呼び、新しいワークスペースを作って、そのウィンドウの全タブを付け替える（`workspacesService.ts:463-504`）。

## 6. UI と入力

- ツールバーボタン `#workspaces-toolbar-button`、ポップアップ、ドラッグで並べ替え（`reorderWorkspaceTo`）。
- ワークスペースの右クリック：上へ、下へ、削除、管理、アーカイブ。
- タブの右クリック：「別のワークスペースへ移動」（`tabContextMenu.tsx`。複数選択に対応）。
- リンクの右クリック：「別のワークスペースで開く」。
- マウスジェスチャ/ホイール：`gecko-workspace-next`、`gecko-workspace-previous`（`actions.ts:500-508`、`command-registry.ts:116-117, 181-182`、`wheel-action-policy.ts:20-21`、`gesture/useAvailableActions.ts`）。`gecko-open-workspaces-preferences` は `libs/shared/custom-shortcut-key/commands.ts:246`。
- **死んだショートカット定義**：`libs/shared/custom-shortcut-key/commands.ts:322-330` の `floorp-open-previous-workspace` / `floorp-open-next-workspace` は、存在しない `globalThis.gWorkspaces.changeWorkspaceToNextOrBeforeWorkspace` を呼ぶ。実装が `gWorkspaces` から `workspacesFuncs` に移った名残とみられる（`csk/` が参照）。既定のキー割り当てはワークスペース側には無い。
- 設定ページ：`page.tsx` と `BasicSettings.tsx`。自動保存（保存キュー）。項目は有効化（再起動が必要）、`closePopupAfterClick`、`showWorkspaceNameOnToolbar`、`exitOnLastTabClose`、`manageOnBms`、危険ゾーンの「初期化」（アクター/オブザーバ経由）。バックアップ欄はコメントアウト。

## 7. 既知の問題・注意

- 設定の既定値の食い違い（§2.2）。
- 移行で使われていないワークスペースが捨てられる（§3.3）。
- 非公開フィールド `_endRemoveArgs[1]` 依存（§4.5）。
- ランタイムパッチの 2 系統の同期（§1.5）。
- ストアが pref 形式にランタイムパッチと OS サーバから直接依存（§5.2、§1.3）。
- 死んだショートカット定義（§6）。
- コード中で参照される Issue：2053、2193、2201、2247、2343、2509、2616（`workspacesTabManager.tsx`、`workspacesService.ts`）、2684・2707（最後のタブのテストと手順書）、2823（外部コンテナの手順書）。

## 8. テスト

`browser-features/chrome/common/workspaces/test/`（22 ファイル）：`configPersistence`、`workspacesOldType`（旧形式のスキーマ）、`workspaceSnapshotUtils`、`workspacesArchiveHelpers`、`workspaceIconRawValue`、`workspaceIcons`、`menuAccessKey`、`explicitTabUserContext`、`containerColor`、`tabReplacementLifecycle`、`modalCallerRequestLifecycle`、`workspacesStaticNames`、`workspaceLastTabPolicy`、`workspaceLastTabPreservation`、`nativeLastTab{Disabled{Close,KeepOpen},WorkspacesEnabled}`。手順書：`last-tab-regression.md`（2707）、`external-container-regression.md`（2823）。

そのほか：`overrides/modules/workspaces/test/{openLinkUserContext,clipboard}.test.ts`、`chrome/test/unit/workspacesUI.test.ts`、`ui-custom/test/bookmarkWorkspaceContainer.test.ts`、`os-apis/workspaces/WorkspacesApiService.test.mts`、`pages-modal-child/test/workspaceIconPickerModel.test.ts`、`pages-settings/test/integration/settings.test.ts`、`private-container/test/sessionStoreRestoreOpen.test.js`、`tools/src/workspace_*_patch.test.ts`、`tools/os-test/verify_workspace_external_containers.ts`。

## 9. i18n

- チャローム：`i18n/<locale>/browser-chrome.json`。en-US に "workspace" を含むキーが 79 個。`workspaces.{modal,icons,service,context-menu,popup,menu,error}.*`、`mouseGesture.actions.gecko-*workspace*`、`commandPalette.categories.workspace`、`commandPalette.openUrlContainerWorkspaceDefault[Desc]`。
- 設定ページ：`browser-features/pages-settings/src/lib/i18n/locales/<locale>.json` の `workspaces` キー（約 27 個。`initialize*`、`backup*` を含む）。

## 10. ドキュメント

`docs/development/features/browser-features/common/tabs-and-workspaces.mdx` と `.../modules/pwa-workspaces-profile-actors.mdx` は自動生成の一覧で、データ形式の記述は無い。`.github/patches/floorp-runtime/common/README.md` にランタイムパッチ 3 本の説明がある。
