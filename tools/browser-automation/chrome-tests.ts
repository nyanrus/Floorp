/**
 * Chrome-context test helpers for BrowserAutomation
 * These functions run JavaScript in the browser chrome context via Marionette
 * using the raw send() WebDriver:ExecuteScript marionette call.
 *
 * Each function accepts:
 * - getSend(): () => sendFn | null
 * - setContext(ctx): Promise<void>
 *
 * SPDX-License-Identifier: MPL-2.0
 */

export type SendFn = (name: string, params?: Record<string, unknown>, key?: string) => Promise<unknown>;
export type GetSend = () => SendFn | null;
export type SetContext = (ctx: "chrome" | "content") => Promise<void>;

export async function createDateTimeOverlay(getSend: GetSend, setContext: SetContext) {
  try {
    const send = getSend();
    if (!send) throw new Error("Browser not initialized (no send)");
    await setContext("chrome");

    const res = await send("WebDriver:ExecuteScript", {
      script: `
        (function(){
          // operate on the most recent browser window's document if needed
          var win = typeof Services !== "undefined" && Services.wm ? Services.wm.getMostRecentWindow("navigator:browser") : window;
          var doc = (win && win.document) ? win.document : document;
          var existing = doc.getElementById("floorp-datetime-overlay");
          if (existing) existing.remove();
          var overlay = doc.createElement("div");
          overlay.id = "floorp-datetime-overlay";
          overlay.setAttribute("role","status");
          overlay.setAttribute("aria-live","polite");
          overlay.style.cssText = "position: fixed; top: 10px; right: 10px; padding: 8px 12px; background: rgba(0,0,0,0.8); color: white; border-radius:6px; z-index:2147483647;";
          function update(){ var now=new Date(); overlay.textContent = now.toLocaleString(); overlay.setAttribute("data-ts", now.toISOString()); }
          update();
          var id = win.setInterval ? win.setInterval(update,1000) : window.setInterval(update,1000);
          overlay.setAttribute("data-interval-id", String(id));
          (doc.body || doc.documentElement).appendChild(overlay);
          return { visible: true, time: overlay.textContent };
        })()
      `,
      args: []
    }, "value");

    await setContext("content");
    return { success: true, overlayVisible: (res as any)?.visible, displayedTime: (res as any)?.time };
  } catch (error) {
    try { await setContext("content"); } catch {}
    return { success: false, overlayVisible: false, error: String(error) };
  }
}

export async function verifyDateTimeOverlay(getSend: GetSend, setContext: SetContext) {
  try {
    const send = getSend();
    if (!send) throw new Error("Browser not initialized (no send)");
    await setContext("chrome");

    const res = await send("WebDriver:ExecuteScript", {
      script: `
        (function(){
          var win = typeof Services !== "undefined" && Services.wm ? Services.wm.getMostRecentWindow("navigator:browser") : window;
          var doc = (win && win.document) ? win.document : document;
          var o = doc.getElementById("floorp-datetime-overlay");
          if (!o) return { visible:false };
          var ts = o.getAttribute("data-ts");
          var now = new Date();
          var isRecent = false;
          if (ts) {
            var d = new Date(ts);
            isRecent = Math.abs(now.getTime() - d.getTime()) < 5000;
          }
          return { visible:true, time: o.textContent, timestamp: ts, isRecent: isRecent };
        })()
      `,
      args: []
    }, "value");

    await setContext("content");
    return { success: true, overlayVisible: (res as any)?.visible ?? false, displayedTime: (res as any)?.time };
  } catch (error) {
    try { await setContext("content"); } catch {}
    return { success: false, overlayVisible: false, error: String(error) };
  }
}

export async function removeDateTimeOverlay(getSend: GetSend, setContext: SetContext) {
  try {
    const send = getSend();
    if (!send) throw new Error("Browser not initialized (no send)");
    await setContext("chrome");

    await send("WebDriver:ExecuteScript", {
      script: `
        (function(){
          var win = typeof Services !== "undefined" && Services.wm ? Services.wm.getMostRecentWindow("navigator:browser") : window;
          var doc = (win && win.document) ? win.document : document;
          var o = doc.getElementById("floorp-datetime-overlay");
          if (o) {
            var id = o.getAttribute("data-interval-id");
            if (id) {
              try { win.clearInterval(parseInt(id,10)); } catch(e) { try { window.clearInterval(parseInt(id,10)); } catch(e2){} }
            }
            o.remove();
            return { removed: true };
          }
          return { removed: false };
        })()
      `,
      args: []
    }, "value");

    await setContext("content");
    return { success: true };
  } catch (error) {
    try { await setContext("content"); } catch {}
    return { success: false, error: String(error) };
  }
}

export async function createTestButton(getSend: GetSend, setContext: SetContext, label: string, id = "floorp-test-button") {
  try {
    const send = getSend();
    if (!send) throw new Error("Browser not initialized (no send)");
    await setContext("chrome");

    const res = await send("WebDriver:ExecuteScript", {
      script: `
        (function(){
          var win = typeof Services !== "undefined" && Services.wm ? Services.wm.getMostRecentWindow("navigator:browser") : window;
          var doc = (win && win.document) ? win.document : document;
          var btnId = ${JSON.stringify(id)};
          var btnLabel = ${JSON.stringify(label)};
          var existing = doc.getElementById(btnId);
          if (existing) existing.remove();
          var button = doc.createElement("button");
          button.id = btnId;
          button.setAttribute("aria-label", btnLabel);
          button.setAttribute("role", "button");
          button.textContent = btnLabel;
          button.style.cssText = "position: fixed; top: 60px; right: 10px; padding:8px 12px; z-index:2147483647;";
          button.setAttribute("data-clicked","false");
          button.addEventListener("click", function(){ button.setAttribute("data-clicked","true"); button.style.background = "#2ECC71"; button.textContent = "Clicked!"; });
          (doc.body || doc.documentElement).appendChild(button);
          return { id: btnId, label: btnLabel };
        })()
      `,
      args: []
    }, "value");

    await setContext("content");
    return { success: true, value: res };
  } catch (error) {
    try { await setContext("content"); } catch {}
    return { success: false, error: String(error) };
  }
}

export async function testAccessibility(getSend: GetSend, setContext: SetContext, selector: string) {
  try {
    const send = getSend();
    if (!send) throw new Error("Browser not initialized (no send)");
    await setContext("chrome");

    const res = await send("WebDriver:ExecuteScript", {
      script: `
        (function(){
          var win = typeof Services !== "undefined" && Services.wm ? Services.wm.getMostRecentWindow("navigator:browser") : window;
          var doc = (win && win.document) ? win.document : document;
          var s = ${JSON.stringify(selector)};
          var el = doc.querySelector(s);
          if (!el) return { error: "Element not found: " + s };
          return {
            tagName: (el.tagName||"").toLowerCase(),
            ariaLabel: el.getAttribute("aria-label"),
            role: el.getAttribute("role"),
            id: el.id || null,
            className: el.className || null
          };
        })()
      `,
      args: []
    }, "value");

    await setContext("content");
    const typed = res as any;
    if (typed?.error) return { success: false, passed: false, error: typed.error };
    const passed = Boolean(typed?.ariaLabel || typed?.role);
    return { success: true, element: typed, passed };
  } catch (error) {
    try { await setContext("content"); } catch {}
    return { success: false, passed: false, error: String(error) };
  }
}

export async function testButton(getSend: GetSend, setContext: SetContext, selector: string) {
  try {
    const send = getSend();
    if (!send) throw new Error("Browser not initialized (no send)");
    await setContext("chrome");

    const clickRes = await send("WebDriver:ExecuteScript", {
      script: `
        (function(){
          var win = typeof Services !== "undefined" && Services.wm ? Services.wm.getMostRecentWindow("navigator:browser") : window;
          var doc = (win && win.document) ? win.document : document;
          var s = ${JSON.stringify(selector)};
          var el = doc.querySelector(s);
          if (!el) return { success:false, error: "Element not found: " + s };
          try { el.click(); } catch(e) { try { var evt = doc.createEvent('MouseEvents'); evt.initMouseEvent('click', true, true); el.dispatchEvent(evt); } catch(e2){} }
          return { success:true };
        })()
      `,
      args: []
    }, "value");

    if (!(clickRes as any)?.success) {
      await setContext("content");
      throw new Error(((clickRes as any)?.error) ?? "click failed");
    }

    // check data-clicked attribute
    const check = await send("WebDriver:ExecuteScript", {
      script: `
        (function(){
          var win = typeof Services !== "undefined" && Services.wm ? Services.wm.getMostRecentWindow("navigator:browser") : window;
          var doc = (win && win.document) ? win.document : document;
          var s = ${JSON.stringify(selector)};
          var el = doc.querySelector(s);
          if (!el) return null;
          return el.getAttribute("data-clicked");
        })()
      `,
      args: []
    }, "value");

    await setContext("content");
    return { success: true, value: { clicked: (check as any) === "true", selector } };
  } catch (error) {
    try { await setContext("content"); } catch {}
    return { success: false, error: String(error) };
  }
}