// SPDX-License-Identifier: MPL-2.0
// Minimal ambient types for Gecko/XUL globals used in Floorp chrome code.
// These are intentionally lightweight and only include members we actually use.
//
// IMPORTANT: This file has NO `export {}` — it is a SCRIPT file (not a module).
// All declarations at the top level are automatically global.
// This is required so that `declare var document: Document` can override
// Gecko's `Document | null` (TypeScript uses the first `declare var` it encounters,
// so this file must be listed BEFORE `jsr:@types/gecko` in deno.json `compilerOptions.types`).

// Override Gecko's `Document | null` — in Firefox chrome context, document is always available.
// deno-lint-ignore-file no-var
declare var document: Document;

/* ------------------------------------------------------------------ *
 *  Supporting types for TabBrowser
 *
 *  Types already provided globally by jsr:@types/gecko are NOT
 *  redefined here: XULElement, nsIURI, nsIPrincipal, nsIReferrerInfo.
 *
 *  MozTabbrowserTab is NOT in @types/gecko so we define it here.
 * ------------------------------------------------------------------ */

/**
 * A loose shape for nsIWebProgressListener — the callbacks Firefox calls
 * to keep you posted: a page started loading, finished, changed location,
 * and so on. Every callback is optional, so implement only the ones you
 * care about.
 */
interface WebProgressListener {
  onStateChange?(...args: unknown[]): void;
  onProgressChange?(...args: unknown[]): void;
  onLocationChange?(...args: unknown[]): void;
  onStatusChange?(...args: unknown[]): void;
  onSecurityChange?(...args: unknown[]): void;
  onContentBlockingEvent?(...args: unknown[]): void;
}

/** A <browser> element — the frame that actually holds one web page.
 *  `gBrowser.selectedBrowser` is one of these.
 *
 *  This is intentionally a standalone interface, not extending `XULBrowserElement`,
 *  so that `MozTabbrowserTab.linkedBrowser: ChromeBrowser` does not conflict
 *  with gecko's `XULElement.linkedBrowser?: XULBrowserElement`. */
interface ChromeBrowser {
  /** URL currently loaded in this browser. */
  readonly currentURI: nsIURI;
  /** The page's <title>. */
  readonly contentTitle: string;
  /** The page's window. `null` until something has loaded. */
  readonly contentWindow: Window | null;
  /** The page's document. `null` until something has loaded. */
  readonly contentDocument: Document | null;
  readonly browserId: number;
  readonly outerWindowID: number;
  readonly innerWindowID: number;
  readonly browsingContext: BrowsingContext | null;
  readonly docShell: nsIDocShell | null;
  readonly webNavigation: nsIWebNavigation | null;
  readonly messageManager: object;
  /** Who owns the page in this browser. */
  readonly contentPrincipal: nsIPrincipal;
  /** True if the page runs in a separate content process. */
  readonly isRemoteBrowser: boolean;
  readonly remoteType: string | null;
  /** True if the tab's audio is muted. */
  audioMuted: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  /** What the user has typed in the address bar but not yet loaded. */
  userTypedValue: string | null;
  /** Load an nsIURI directly. */
  loadURI(uri: nsIURI, options?: LoadURIOptions | object): void;
  /** Load a URL string, tidying it up first. */
  fixupAndLoadURIString(uriString: string, options?: LoadURIOptions): void;
  reload(): void;
  reloadWithFlags(flags: number): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  /** DOM element operations, available because <browser> is an Element. */
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
}

/** A single tab — the <tab> element in the strip (class MozTabbrowserTab).
 *  This is the little strip item, not the page itself; the page lives in
 *  its `linkedBrowser`.
 *
 *  Extends `XULElement` for compatibility with existing code that types tabs
 *  as `XULElement` and uses `as unknown as XULElement` casts. */
interface MozTabbrowserTab extends XULElement {
  /** The <browser> that holds this tab's page. */
  readonly linkedBrowser: XULBrowserElement & ChromeBrowser;
  linkedPanel: string;
  /** The text shown on the tab. */
  label: string;
  /** True if the tab is pinned to the start of the strip. */
  pinned: boolean;
  /** True if the tab is hidden from the strip. */
  hidden: boolean;
  /** True if this is the active tab. */
  selected: boolean;
  /** True if the tab is part of a multi-select. */
  readonly multiselected: boolean;
  /** True while the tab's page is loading. */
  busy: boolean;
  /** True if the tab is making sound right now. */
  readonly soundPlaying: boolean;
  /** True if the user has muted this tab. */
  muted: boolean;
  /** True if the tab is still empty (about:blank, never really used). */
  readonly isEmpty: boolean;
  /** The tab's position in the strip, counting from 0. */
  readonly _tPos: number;
  /** Timestamp of the last time this tab was selected. `Infinity` for the
   *  currently selected tab (so it sorts last in "most recent" order). */
  _lastAccessed: number;
  userContextId?: number;
  /** The tab that opened this one, if any. */
  readonly owner: MozTabbrowserTab | null;
}

/* ------------------------------------------------------------------ *
 *  Options you pass to methods
 * ------------------------------------------------------------------ */

/**
 * Options for `addTab` / `addTrustedTab` / `addWebTab`.
 * Every field is optional — pass only what you need, or nothing at all.
 */
interface AddTabOptions {
  /** Open the tab without switching to it. Defaults to `true`. */
  inBackground?: boolean;
  /** Treat the new tab as a child of the current one. */
  relatedToCurrent?: boolean;
  /** The tab considered to "own" this one. */
  ownerTab?: MozTabbrowserTab;
  /** The browser that opened this tab. */
  openerBrowser?: ChromeBrowser;
  /** Open the tab already pinned. */
  pinned?: boolean;
  /** Where to drop the tab, counting *all* strip items (tabs + groups). */
  elementIndex?: number;
  /** Where to drop the tab, counting tabs only. */
  tabIndex?: number;
  /** Skip the tab-opening animation. */
  skipAnimation?: boolean;
  skipBackgroundNotify?: boolean;
  noInitialLabel?: boolean;
  userContextId?: number;
  /** Who is opening this tab. */
  triggeringPrincipal?: nsIPrincipal;
  allowInheritPrincipal?: boolean;
  referrerInfo?: nsIReferrerInfo;
  postData?: object;
  /** Move keyboard focus to the address bar once the tab is open. */
  focusUrlBar?: boolean;
  /** True if the load was started from outside Firefox. */
  fromExternal?: boolean;
  allowThirdPartyFixup?: boolean;
  /** Don't build the browser yet. */
  createLazyBrowser?: boolean;
  /** Title to show on a lazy tab before its browser exists. */
  lazyTabTitle?: string;
  forceNotRemote?: boolean;
  preferredRemoteType?: string;
  charset?: string;
  name?: string;
  /** A tab group to drop the new tab into. */
  tabGroup?: object;
  /** Like the old `index` — kept for compat with callers using that name. */
  index?: number;
  /** Like `nextTo` in older code — insert adjacent to this tab. */
  nextTo?: MozTabbrowserTab | XULElement;
}

/** Options for the `removeTab` family. */
interface RemoveTabOptions {
  /** Play the tab-closing animation. */
  animate?: boolean;
  triggeringEvent?: Event;
  /** Close even if the page's `beforeunload` would normally prompt. */
  skipPermitUnload?: boolean;
  /** If this is the last tab, close the whole window with it. */
  closeWindowWithLastTab?: boolean;
  /** Don't hand this close off to session restore. */
  skipSessionStore?: boolean;
  /** True if a person triggered this, not code. */
  isUserTriggered?: boolean;
}

/** Options for `loadURI` / `fixupAndLoadURIString`. */
interface LoadURIOptions {
  /** Who is asking for this load. */
  triggeringPrincipal?: nsIPrincipal;
  referrerInfo?: nsIReferrerInfo;
  postData?: object;
  headers?: object;
  loadFlags?: number;
  flags?: number;
  csp?: object;
  remoteTypeOverride?: string;
}

/** The <tabs> container element, with extra Tabbrowser-specific helpers. */
interface TabBrowserTabContainer extends XULElement {
  /** Advance the selected tab by `delta` positions (wraps if `wrap` is true). */
  advanceSelectedTab(delta: number, wrap: boolean): void;
  /** Programmatically select a tab (internal API). */
  _selectNewTab(tab: MozTabbrowserTab, ...args: unknown[]): void;
  /** True when tabs are displayed in a vertical stack. */
  verticalMode?: boolean;
}

/* ------------------------------------------------------------------ *
 *  gBrowser itself — the Tabbrowser controller
 * ------------------------------------------------------------------ */

/** Everything `gBrowser` can do, grouped so it's easy to scan. */
interface TabBrowser {
  /* --- Reaching the tabs and browsers --- */

  /** Every tab, in strip order. */
  tabs: MozTabbrowserTab[];
  /** Just the tabs the user can see (hidden ones left out). */
  visibleTabs: MozTabbrowserTab[];
  /** Every <browser> — one per tab. */
  readonly browsers: ChromeBrowser[];
  /** How many tabs are pinned. */
  readonly pinnedTabCount: number;
  /** The <tabs> strip element that lays the tabs out. */
  tabContainer: TabBrowserTabContainer;
  /** The <tabbox> element. */
  readonly tabbox: XULElement;
  /** The <tabpanels> element that holds the page panels. */
  readonly tabpanels: XULElement;

  /** The active tab. Read as `MozTabbrowserTab`; assign any `XULElement`
   *  (existing code often casts via `as unknown as XULElement`). */
  get selectedTab(): MozTabbrowserTab;
  set selectedTab(tab: MozTabbrowserTab | XULElement);
  /** Tabs that are part of the current multi-selection. */
  selectedTabs: MozTabbrowserTab[];
  /** The active tab's <browser> — i.e. the page in front of the user. */
  selectedBrowser: ChromeBrowser;

  /* --- What's in the active tab right now --- */

  /** URL showing in the active tab. */
  currentURI?: nsIURI | { spec: string };
  /** Window of the active tab's page. */
  readonly contentWindow: Window | null;
  /** Document of the active tab's page. */
  readonly contentDocument: Document | null;
  /** <title> of the active tab's page. */
  readonly contentTitle: string;
  readonly webNavigation: object;
  readonly webProgress: object;
  /** True if the active tab has somewhere to go back to. */
  readonly canGoBack: boolean;
  /** True if the active tab has somewhere to go forward to. */
  readonly canGoForward: boolean;

  /* --- Tab groups --- */

  /** Tab groups in the strip. Shape is deliberately loose — extend as needed. */
  tabGroups: Array<{ tabs: XULElement[]; style: { display: string } }>;

  /* --- Opening tabs --- */

  /** Open a new tab. For untrusted callers you must pass
   *  `options.triggeringPrincipal`. Returns the tab it created. */
  addTab(uri: string, options?: AddTabOptions): MozTabbrowserTab;
  /** Like `addTab`, but opened with the system principal. */
  addTrustedTab(uri: string, options?: AddTabOptions): MozTabbrowserTab;
  /** Open a tab as if normal web content had asked for it. */
  addWebTab(uri: string, options?: AddTabOptions): MozTabbrowserTab;
  /** Open several URLs as tabs in one go. */
  loadTabs(uris: string[], options?: object): void;
  /** Make a copy of an existing tab, history and all. */
  duplicateTab(
    tab: MozTabbrowserTab,
    restoreTabImmediately?: boolean,
    options?: object,
  ): MozTabbrowserTab;

  /* --- Closing tabs --- */

  /** Close one tab. */
  removeTab(tab: MozTabbrowserTab | XULElement, options?: RemoveTabOptions): void;
  /** Close whichever tab is active right now. */
  removeCurrentTab(options?: RemoveTabOptions): void;
  /** Close every tab *except* the one you pass. */
  removeAllTabsBut(tab: MozTabbrowserTab, options?: RemoveTabOptions): void;
  /** Close several tabs at once. */
  removeTabs(tabs: MozTabbrowserTab[], options?: RemoveTabOptions): void;

  /* --- Finding your way between tab, browser, and window --- */

  /** Given a <browser>, find the tab it belongs to. */
  getTabForBrowser(browser: ChromeBrowser): MozTabbrowserTab | null;
  /** Given a tab, get its <browser>. */
  getBrowserForTab(tab: MozTabbrowserTab | XULElement): ChromeBrowser;
  /** Get the <browser> at position N. */
  getBrowserAtIndex(index: number): ChromeBrowser;
  /** Find a <browser> by its outer window id. */
  getBrowserForOuterWindowID(id: number): ChromeBrowser | null;

  /* --- Selecting and reordering tabs --- */

  /** Switch to the tab at position N. */
  selectTabAtIndex(index: number, event?: Event): void;
  /** Move a tab to a new position in the strip. */
  moveTabTo(tab: MozTabbrowserTab, index: number): void;
  /** Send a tab to the far start of the strip (defaults to the active tab). */
  moveTabToStart(tab?: MozTabbrowserTab): void;
  /** Send a tab to the far end of the strip (defaults to the active tab). */
  moveTabToEnd(tab?: MozTabbrowserTab): void;
  /** Nudge the active tab one step toward the end. */
  moveTabForward(): void;
  /** Nudge the active tab one step toward the start. */
  moveTabBackward(): void;

  /* --- Pinning, showing, hiding --- */

  pinTab(tab: MozTabbrowserTab | XULElement): void;
  unpinTab(tab: MozTabbrowserTab | XULElement): void;
  showTab(tab: MozTabbrowserTab | XULElement): void;
  hideTab(tab: MozTabbrowserTab | XULElement, source?: string): void;

  /* --- Navigating (acts on the active tab) --- */

  /** Reload the active tab. */
  reload(): void;
  reloadWithFlags(flags: number): void;
  /** Reload one specific tab. */
  reloadTab(tab: MozTabbrowserTab): void;
  /** Reload all open tabs. */
  reloadAllTabs(): void;
  /** Reload several tabs at once. */
  reloadTabs(tabs: MozTabbrowserTab[]): void;
  /** Step back through the active tab's history. */
  goBack(requireUserInteraction?: boolean): void;
  /** Step forward through the active tab's history. */
  goForward(requireUserInteraction?: boolean): void;
  /** Stop the active tab loading. */
  stop(): void;
  /** Jump to a specific point in the active tab's session history. */
  gotoIndex(index: number): void;
  /** Load an nsIURI in the active tab. */
  loadURI(uri: nsIURI, options?: LoadURIOptions | Record<string, unknown>): void;
  /** Load a URL string in the active tab, tidying it up first. */
  fixupAndLoadURIString(uriString: string, options?: LoadURIOptions): void;

  /* --- Listening for load progress --- */

  /** Start hearing load events for the *active* browser. */
  addProgressListener(listener: WebProgressListener): void;
  /** Stop a listener added with `addProgressListener`. */
  removeProgressListener(listener: WebProgressListener): void;
  /** Start hearing load events for *all* tabs. */
  addTabsProgressListener(listener: WebProgressListener | Pick<nsIWebProgressListener, "onLocationChange">): void;
  /** Stop a listener added with `addTabsProgressListener`. */
  removeTabsProgressListener(listener: WebProgressListener | Pick<nsIWebProgressListener, "onLocationChange">): void;

  /* --- Tab icons --- */

  /** Set a tab's favicon. */
  setIcon(
    tab: MozTabbrowserTab,
    icon: string | nsIURI,
    loadingPrincipal?: nsIPrincipal,
  ): void;
  /** Get a tab's favicon URL. */
  getIcon(tab?: MozTabbrowserTab): string | null;

  /* --- Audio --- */

  /** Toggle mute on all selected tabs (or just `tab` if none are multi-selected). */
  toggleMuteAudioOnMultiSelectedTabs(tab: MozTabbrowserTab): void;

  /* --- Telemetry / metrics (internal, present at runtime) --- */

  /** Internal telemetry helper. Returns a context object to spread into
   *  `removeCurrentTab` options so the close is attributed correctly. */
  TabMetrics: {
    userTriggeredContext(): Record<string, unknown>;
  };

  /* --- A few more things you'll reach for --- */

  /** Ask the user "really close N tabs?" and return whether it's OK. */
  warnAboutClosingTabs(tabsToClose: number, closeTabsAction?: number): boolean;
  /** Tear a tab off into its own brand-new window. */
  replaceTabWithWindow(tab: MozTabbrowserTab, options?: object): Window;
  /** Move one tab's page into another tab, then close the emptied one. */
  swapBrowsersAndCloseOther(ourTab: MozTabbrowserTab, theirTab: MozTabbrowserTab): void;
  /** Change which process a browser runs in. */
  updateBrowserRemoteness(browser: ChromeBrowser, options?: object): void;
  /** Decide which tab becomes active once `tab` is closed. */
  setSuccessor(tab: MozTabbrowserTab, successorTab: MozTabbrowserTab | null): void;
  /** Free a tab's memory while keeping the tab itself. */
  discardBrowser(tab: MozTabbrowserTab, forceDiscard?: boolean): boolean;
}

interface TabContextMenu {
  contextTab: XULElement & { multiselected?: boolean };
}

interface PanelUI {
  showSubView(id: string, anchor?: Element | null): Promise<void>;
}

interface GFloorpTabColor {
  setEnable(enabled: boolean): void;
}

interface GFloorpStatusBar {
  setShow: (value: boolean) => void;
}

interface GFloorp {
  tabColor?: GFloorpTabColor;
  statusBar?: GFloorpStatusBar;
  [key: string]: unknown;
}

interface CustomizableUI {
  TYPE_TOOLBAR: "toolbar";
  AREA_NAVBAR: "nav-bar";
  AREA_BOOKMARKS: "PersonalToolbar";
  AREA_TABSTRIP: "TabsToolbar";
  AREA_MENUBAR: "toolbar-menubar";
  registerArea(
    name: string,
    config: { type: string; defaultPlacements: string[] },
  ): void;
  unregisterArea(name: string, arg2?: boolean): void;
  registerToolbarNode(node: Element): void;
}

/** Known CustomizableUI area identifiers. Extensible via `string & {}` for custom areas. */
type TCustomizableUIArea =
  | "nav-bar"
  | "PersonalToolbar"
  | "TabsToolbar"
  | "toolbar-menubar"
  | (string & Record<PropertyKey, never>);

// Gecko globals
declare var gBrowser: TabBrowser;
declare var TabContextMenu: TabContextMenu;
declare var PanelUI: PanelUI;
declare var gFloorp: GFloorp;
declare var CustomizableUI: CustomizableUI;

// user_pref — Firefox preference setter used in user.js files
declare function user_pref(
  name: string,
  value: string | number | boolean,
): void;

// Ensure globalThis is augmented for property access like globalThis.gBrowser
// oxlint-disable-next-line no-shadow-restricted-names
declare namespace globalThis {
  // Using 'var'/'const' mirrors runtime globals exposed by Gecko
  // and allows property access off globalThis without index errors.
  var gBrowser: TabBrowser;
  var TabContextMenu: TabContextMenu;
  var PanelUI: PanelUI;
  var gFloorp: GFloorp;
  var CustomizableUI: CustomizableUI;

  // Gecko chrome globals used in status reporting and context menus
  var StatusPanel: { _label: string };
  var XULBrowserWindow: {
    statusTextField: { label: string };
  };
  var closeMenus: ((element: Element) => void) | undefined;
  var gContextMenu: { linkURL: string | undefined } | undefined;

  // Gecko session and download globals
  var SessionStore: {
    getCustomTabValue(tab: XULElement, key: string): string;
    setCustomTabValue(tab: XULElement, key: string, value: string): void;
    getLazyTabValue(tab: XULElement, key: string): string;
    getSessionHistory(tab: XULElement): unknown;
    getTabState(tab: XULElement): string;
    undoCloseTab(aIndex?: number): XULElement;
    undoCloseWindow?(aIndex?: number): unknown;
    setWindowState(window: Window, state: string, overwrite?: boolean): void;
    getWindowState(window: Window): string;
    getBrowserState(): string;
    setBrowserState(state: string): void;
    getClosedTabCount(window?: Window): number;
    getClosedTabData(window?: Window): unknown[];
    promiseInitialized: Promise<void>;
    persistTabAttribute(attrName: string): void;
  };
  var DownloadsPanel: {
    show(): Promise<void>;
    richListBox?: Element;
    panel?: Element;
    showPanel?(): void;
    hidePanel?(): void;
    initialize?(): void;
    _initialized?: boolean;
    onDownloadAdded?(download: unknown): void;
    onDownloadAdded_hook?(download: unknown): void;
    contextMenu?: unknown;
  };
  var DownloadsView: {
    richlistbox: Element;
    contextMenu?: unknown;
    onDownloadAdded?(download: unknown): void;
    onDownloadAdded_hook?(download: unknown): void;
  };
  var SidebarController: {
    currentID: string;
    sidebars?: unknown;
    reversePosition?: boolean;
  };

  // Floorp-specific chrome globals
  var gFloorpPageAction: Record<string, unknown>;
  var gFloorpPrivateContainer: unknown;
  var gFloorpPanelSidebarCurrentPanel: unknown;
  var gFloorpPanelSidebar: unknown;
  var floorpWebPanelWindow: unknown;
  var floorpSsbWindow: unknown;
  var floorpBmsUserAgent: unknown;
  var gMiddleClickNewTabUsesPasteboard: unknown;

  // Gecko utility globals
  var openUILinkIn: (
    url: string | nsIURI,
    where: string,
    params?: Record<string, unknown>,
  ) => void;
  var openTrustedLinkIn: (
    url: string | nsIURI,
    where: string,
    params?: Record<string, unknown>,
  ) => void;
  var readFromClipboard: () => string;
  var openPreferences: (pane?: string) => void;
  var ZoomManager: { zoom: number };
  var bmsLoadedURI: string;
  var BROWSER_NEW_TAB_URL: string;
  var BrowserAddonUI: { openAddonsMgr(url: string): void };
  var BrowserCommands: { openTab(options?: Record<string, unknown>): void };
  var BrowserUtils: {
    whereToOpenLink(
      event: Event,
      allowBlank?: boolean,
      ignoreAlt?: boolean,
    ): string;
  };
  var E10SUtils: {
    EXTENSION_REMOTE_TYPE: string;
    deserializePrincipal(principal: unknown): unknown;
    getRemoteTypeForURI(uri: string, ...args: unknown[]): string;
    predictOriginAttributes(
      options: Record<string, unknown>,
    ): Record<string, unknown>;
  };
  var UrlbarUtils: { stripUnsafeProtocolOnPaste(text: string): string };
  var E: unknown;
  var noraAAA: unknown;
}

// Augment the global Window type so that `win.gBrowser` is typed on any
// `Window`-typed variable (e.g. `win: Window`, `window`, `targetPanelWindow`).
interface Window {
  gBrowser: TabBrowser;
}

// Add custom XUL events we listen to
interface GlobalEventHandlersEventMap {
  TabOpen: Event;
  TabClose: Event;
}
