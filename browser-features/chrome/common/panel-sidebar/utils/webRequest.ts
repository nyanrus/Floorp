/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { BrowserWindowTracker } = ChromeUtils.importESModule(
  "resource:///modules/BrowserWindowTracker.sys.mjs",
);

// Mobile User-Agent string for Android
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 Edg/114.0.1823.79";

/**
 * Observer for http-on-modify-request
 * Modifies User-Agent header for all HTTP requests
 */
const httpRequestObserver = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe: (subject: nsISupports, topic: string) => {
    if (
      topic !== "http-on-modify-request" ||
      !(subject instanceof Ci.nsIHttpChannel)
    ) {
      return;
    }

    const channel = subject as nsIHttpChannel;
    if (!getWebPanelWindowByBrowserId(channel.browserId)) return;

    try {
      channel.setRequestHeader("User-Agent", MOBILE_UA, false);
    } catch (error) {
      console.error("Failed to set User-Agent:", error);
    }
  },
};

export function getWebPanelWindowByBrowserId(
  browserId: number,
  windows: readonly Window[] = BrowserWindowTracker.orderedWindows,
): Window | null {
  // A missing ID must never match an uninitialized browser.
  if (!Number.isSafeInteger(browserId) || browserId <= 0) return null;
  for (const win of windows) {
    if (win.closed) continue;
    if (
      win.floorpWebPanelWindow && win.floorpBmsUserAgent &&
      win.floorpWebPanelContentBrowser?.isConnected !== false &&
      win.floorpWebPanelContentBrowser?.browserId === browserId
    ) return win;

    // Web panels embed browser.xhtml inside a sidebar <browser>; those child
    // windows are not necessarily in BrowserWindowTracker. Match the inner
    // content browser, never the sidebar host or a normal browser tab.
    for (
      const host of win.document.querySelectorAll(".sidebar-panel-browser")
    ) {
      const child = (host as XULBrowserElement).browsingContext
        ?.associatedWindow as Window | undefined;
      if (
        child?.floorpWebPanelWindow && !child.closed &&
        child.floorpBmsUserAgent &&
        child.floorpWebPanelContentBrowser?.isConnected !== false &&
        child.floorpWebPanelContentBrowser?.browserId === browserId
      ) return child;
    }
  }
  return null;
}

// Register observer
Services.obs.addObserver(httpRequestObserver, "http-on-modify-request", false);
