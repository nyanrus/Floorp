// SPDX-License-Identifier: MPL-2.0
// @colocated-env browser

import { assert, assertEquals, runTests } from "../../../test/utils/test_harness.ts";
import { panelSidebarData, selectedPanelId, setPanelSidebarData } from "../data/data.ts";
import { PanelNavigator } from "../panel-navigator.ts";
import { getWebPanelChromeWindow, getWebPanelContentBrowser, loadUriInWebPanelBrowser } from "../utils/web-panel-browser.ts";
import "../utils/webRequest.ts";

// A loopback HTTP echo server using shipped XPCOM APIs, so the colocated
// runner does not need a mochitest-only testing-common resource mapping.
async function testNetworkUserAgent(): Promise<void> {
  const server = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
  const received = new Map<string, string>();
  const transports: nsISocketTransport[] = [];
  server.init(-1, true, -1);
  server.asyncListen({
    onSocketAccepted(_socket: nsIServerSocket, transport: nsISocketTransport): void {
      transports.push(transport);
      const input = transport.openInputStream(0, 0, 0).QueryInterface(Ci.nsIAsyncInputStream);
      const reader = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
      reader.init(input);
      let headers = "";
      const callback = {
        onInputStreamReady(): void {
          const available = input.available();
          if (!available) return;
          headers += reader.read(available);
          if (!headers.includes("\r\n\r\n")) {
            input.asyncWait(callback, 0, 0, Services.tm.currentThread);
            return;
          }
          const target = headers.split(" ")[1];
          const ua = /^User-Agent: (.*)\r?$/im.exec(headers)?.[1]?.trim() ?? "";
          const body = JSON.stringify({ "user-agent": ua });
          const reply = `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: ${body.length}\r\n\r\n${body}`;
          const output = transport.openOutputStream(1, 0, 0);
          output.write(reply, reply.length);
          output.close();
          input.close();
          received.set(new URL(target, "http://localhost").search.slice(1), ua);
        },
      };
      input.asyncWait(callback, 0, 0, Services.tm.currentThread);
    },
    onStopListening(): void {},
  });
  const base = `http://127.0.0.1:${server.port}/ua`;
  const panels = panelSidebarData();
  const selected = selectedPanelId();
  const controller = PanelNavigator.gPanelSidebar;
  assert(controller, "panel sidebar should be initialized");
  const id = "web-panel-ua-network-regression";
  const ids = new Map<string, number>();
  const observer = {
    observe(subject: nsISupports): void {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      if (channel.URI.spec.startsWith(base)) {
        ids.set(new URL(channel.URI.spec).search.slice(1), channel.browserId);
      }
    },
  };
  Services.obs.addObserver(observer, "http-on-modify-request");
  let tab: ReturnType<typeof gBrowser.addTab> | undefined;
  async function waitFor(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for UA network regression");
  }
  try {
    setPanelSidebarData([...panels, {
      id, type: "web", width: 400, url: "about:blank", userAgent: true,
      userContextId: 0, icon: undefined, zoomLevel: undefined, extensionId: undefined,
    }]);
    controller.changePanel(id);
    await waitFor(() => !!getWebPanelContentBrowser(id) &&
      !!getWebPanelChromeWindow(id)?.floorpBmsUserAgent);
    const browser = getWebPanelContentBrowser(id)!;
    loadUriInWebPanelBrowser(browser, `${base}?mobile`);
    await waitFor(() => received.has("mobile"));
    assertEquals(ids.get("mobile"), browser.browserId,
      "Firefox channel.browserId must equal the inner panel browserId");
    assert(received.get("mobile")?.includes("Mobile"), "server must receive mobile UA");

    tab = gBrowser.addTab("about:blank", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    loadUriInWebPanelBrowser(tab.linkedBrowser, `${base}?tab`);
    await waitFor(() => received.has("tab"));
    assert(!received.get("tab")?.includes("Mobile"), "normal tab must retain desktop UA");

    // Recreate just as the settings toggle does, verifying persisted false.
    controller.unloadPanel(id);
    setPanelSidebarData((data) => data.map((panel) => panel.id === id ? { ...panel, userAgent: false } : panel));
    controller.changePanel(id);
    await waitFor(() => !!getWebPanelContentBrowser(id));
    loadUriInWebPanelBrowser(getWebPanelContentBrowser(id)!, `${base}?desktop`);
    await waitFor(() => received.has("desktop"));
    assertEquals(received.get("desktop"), received.get("tab"),
      "disabled panel must send the same UA as a normal tab");
  } finally {
    Services.obs.removeObserver(observer, "http-on-modify-request");
    if (tab) gBrowser.removeTab(tab);
    controller.unloadPanel(id);
    setPanelSidebarData(panels);
    if (selected) controller.changePanel(selected);
    server.close();
    for (const transport of transports) transport.close(Cr.NS_OK);
  }
}

export async function runAllTests(): Promise<void> {
  await runTests("webPanelUserAgentNetwork.test.ts", [
    { name: "only web panel requests use mobile UA and browser IDs agree", fn: testNetworkUserAgent },
  ]);
}
