// SPDX-License-Identifier: MPL-2.0


import { createRootHMR, render } from "@nora/solid-xul";
import { DonwloadBar } from "./downloadbar";
import { DownloadBarManager } from "./downloadbar-manager";
import { createRoot } from "solid-js";

export let manager: DownloadBarManager;

// THIS CANNOT BE HOT RELOADED
// TODO: REMOVE ALL CREATE_ROOT_HMR

let disposeDownloadBar: (() => void) | null = null;

export function init() {
  disposeDownloadBar = createRoot((dispose) => {
    manager = new DownloadBarManager();

    manager.init();
    // console.log(manager.showDownloadBar());
    if (!manager.showDownloadBar()) {
      return dispose;
    }
    document.getElementById("downloadsPanel")?.remove();
    render(DonwloadBar, document.getElementById("appcontent"));
    console.log("init download bar");
    window.DownloadsPanel.hidePanel = () => {
      return;
    };
    delete window.DownloadsView.contextMenu;
    delete window.DownloadsPanel.panel;
    delete window.DownloadsPanel.richListBox;
    window.DownloadsPanel.panel = document.getElementById("downloadsPanel");
    window.DownloadsPanel.richListBox =
      document.getElementById("downloadsListBox");
    window.DownloadsView.contextMenu = document.getElementById(
      "downloadsContextMenu",
    );
    window.DownloadsPanel._initialized = false;
    window.DownloadsPanel.initialize();
    window.DownloadsView.onDownloadAdded = (download) => {
      document.getElementById("downloadsListBox").scrollLeft = 0;
      DownloadsView.onDownloadAdded_hook(download);
    };
    const scrollElem = document.getElementById("downloadsListBox");
    const wheelHandler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) {
        return;
      }
      e.preventDefault();
      scrollElem.scrollLeft += e.deltaY * 10;
    };
    scrollElem?.addEventListener("wheel", wheelHandler);
    
    // Return cleanup function that will be called by dispose
    return () => {
      scrollElem?.removeEventListener("wheel", wheelHandler);
      dispose();
    };
  });
}

export function cleanup() {
  if (disposeDownloadBar) {
    disposeDownloadBar();
    disposeDownloadBar = null;
  }
}
