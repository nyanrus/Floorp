// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import { assertEquals, runTests } from "../../../test/utils/test_harness.ts";
import { getWebPanelWindowByBrowserId } from "../utils/webRequest.ts";

function testEmbeddedPanelLookup(): void {
  const child = {
    floorpWebPanelWindow: true,
    floorpBmsUserAgent: true,
    floorpWebPanelContentBrowser: { browserId: 42 },
  } as unknown as Window;
  const parent = {
    document: {
      querySelectorAll: () => [
        { browserId: 7, browsingContext: { associatedWindow: child } },
        { browsingContext: null },
      ],
    },
  } as unknown as Window;
  assertEquals(getWebPanelWindowByBrowserId(42, [parent]), child,
    "should find a panel absent from the window tracker");
  assertEquals(getWebPanelWindowByBrowserId(7, [parent]), null,
    "must not match the outer sidebar host");
  assertEquals(getWebPanelWindowByBrowserId(99, [parent]), null,
    "must not match a normal tab or another panel");
  assertEquals(getWebPanelWindowByBrowserId(0, [parent]), null,
    "must ignore missing IDs");
  child.floorpBmsUserAgent = false;
  assertEquals(getWebPanelWindowByBrowserId(42, [parent]), null,
    "disabled mobile UA must not match");
  child.floorpBmsUserAgent = true;
  child.floorpWebPanelWindow = false;
  assertEquals(getWebPanelWindowByBrowserId(42, [parent]), null,
    "extension and static panels must not match");
}

export async function runAllTests(): Promise<void> {
  await runTests("webPanelUserAgent.test.ts", [
    { name: "UA lookup follows embedded panels and excludes other browsers", fn: testEmbeddedPanelLookup },
  ]);
}
