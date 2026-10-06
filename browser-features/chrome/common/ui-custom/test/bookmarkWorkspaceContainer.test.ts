// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import Workspaces from "../../workspaces/index.ts";
import { loadBookmarkURI } from "../layout/dom-manipulator.ts";
import {
  assert,
  assertEquals,
  runTests,
  type TestCase,
} from "../../../test/utils/test_harness.ts";

async function checkBookmarkContainer(
  modifier: "ctrlKey" | "metaKey" | "shiftKey",
  useContainer = true,
): Promise<void> {
  const ctx = Workspaces.getCtx(window);
  assert(ctx, "the browser initializes Workspaces before this test");
  const { ContextualIdentityService } = ChromeUtils.importESModule(
    "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
  );
  const cid: number = useContainer
    ? ContextualIdentityService.create(
      "Bookmark regression",
      "fingerprint",
      "blue",
    )
      .userContextId
    : 0;
  const originalResolver = ctx.getCurrentWorkspaceUserContextId;
  const originalTab = gBrowser.selectedTab;
  const previousTabs = new Set(gBrowser.tabs);
  try {
    ctx.getCurrentWorkspaceUserContextId = () => cid;
    assert(
      loadBookmarkURI(
        "data:text/html,bookmark-container-regression",
        new MouseEvent("click", {
          [modifier]: true,
        }),
      ),
      "the bookmark opens successfully",
    );
    const tab = gBrowser.tabs.find((candidate) => !previousTabs.has(candidate));
    assert(tab?.linkedBrowser, "the bookmark creates a content browser");
    const browser = tab.linkedBrowser;
    assert(browser.browsingContext, "the bookmark has a browsing context");
    assertEquals(
      Number(tab.getAttribute("usercontextid") || 0),
      cid,
      "tab identity",
    );
    assertEquals(
      Number(browser.getAttribute("usercontextid") || 0),
      cid,
      "browser identity",
    );
    assertEquals(
      browser.browsingContext.originAttributes.userContextId,
      cid,
      "the browser is created in the workspace jar",
    );
    const deadline = Date.now() + 15_000;
    while (
      browser.currentURI.spec !==
        "data:text/html,bookmark-container-regression" && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assertEquals(
      browser.currentURI.spec,
      "data:text/html,bookmark-container-regression",
      "bookmark content loads",
    );
    const principal = browser.contentPrincipal as nsIPrincipal | undefined;
    assert(principal, "loaded bookmark content has a principal");
    assertEquals(
      principal.originAttributes.userContextId,
      cid,
      "the content principal uses the same jar",
    );
  } finally {
    ctx.getCurrentWorkspaceUserContextId = originalResolver;
    for (const tab of [...gBrowser.tabs]) {
      if (!previousTabs.has(tab)) gBrowser.removeTab(tab);
    }
    gBrowser.selectedTab = originalTab;
    if (cid) ContextualIdentityService.remove(cid);
  }
}

const tests: TestCase[] = [
  ...(["ctrlKey", "metaKey", "shiftKey"] as const).map((modifier) => ({
    name: `${modifier} bookmark creates its browser in the workspace container`,
    fn: () => checkBookmarkContainer(modifier),
  })),
  {
    name: "a workspace without a container uses the default jar",
    fn: () => checkBookmarkContainer("ctrlKey", false),
  },
];

export async function runAllTests(): Promise<void> {
  await runTests("bookmarkWorkspaceContainer.test.ts", tests);
}
