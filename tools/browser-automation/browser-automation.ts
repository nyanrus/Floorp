/**
 * Floorp Browser Automation Tool - concise refactor
 * Focused on Firefox chrome (Marionette) via foxr
 * SPDX-License-Identifier: MPL-2.0
 */

import foxr, { type TBrowser, type TPage, type TElementHandle } from "@jsr/f3liz__foxr";
import { setupFloorp } from "./setup-floorp.ts";
import * as chromeTests from "./chrome-tests.ts";

export interface BrowserAutomationOptions {
  headless?: boolean;
  executablePath?: string;
  defaultViewport?: { width?: number; height?: number };
}

export interface EvaluateResult { success: boolean; value?: unknown; error?: string }

export interface ScreenshotResult { success: boolean; path?: string; buffer?: Buffer; error?: string }

export interface ChromeScreenshotOptions { fullWindow?: boolean; selector?: string; context?: "chrome"|"content"; path?: string }

export class BrowserAutomation {
  private browser: TBrowser | null = null;
  private page: TPage | null = null;
  private executablePath: string | null = null;
  private currentContext: "chrome"|"content" = "content";

  constructor(private options: BrowserAutomationOptions = {}) {}

  private getSend(): ((name: string, params?: Record<string, unknown>, key?: string) => Promise<unknown>) | null {
    if (!this.browser) return null;
    // foxr exposes a private _send; using it for Marionette commands
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.browser as any)._send;
  }

  private async setContext(context: "chrome"|"content") {
    if (this.currentContext === context) return;
    const send = this.getSend();
    if (!send) throw new Error("Browser not initialized");
    await send("Marionette:SetContext", { value: context });
    this.currentContext = context;
  }

  get chrome() {
    const self = this;
    return {
      evaluate: (script: string) => self.chromeEvaluate(script),
      // shorthand: find -> chromeFindElement
      find: (selector: string) => self.chromeFindElement(selector),
      findElement: (selector: string) => self.chromeFindElement(selector),
      screenshot: (path?: string) => self.chromeScreenshot({ path, context: "chrome" }),
      screenshotElement: (selector: string, path?: string) => self.chromeScreenshot({ selector, context: "chrome", path }),
      screenshotFull: (path?: string) => self.chromeScreenshot({ fullWindow: true, context: "chrome", path }),
      // chrome-context test helpers (delegates to chrome-tests)
      createDateTimeOverlay: () => chromeTests.createDateTimeOverlay(() => self.getSend(), self.setContext.bind(self)),
      verifyDateTimeOverlay: () => chromeTests.verifyDateTimeOverlay(() => self.getSend(), self.setContext.bind(self)),
      removeDateTimeOverlay: () => chromeTests.removeDateTimeOverlay(() => self.getSend(), self.setContext.bind(self)),
      createTestButton: (label: string, id?: string) => chromeTests.createTestButton(() => self.getSend(), self.setContext.bind(self), label, id),
      testAccessibility: (selector: string) => chromeTests.testAccessibility(() => self.getSend(), self.setContext.bind(self), selector),
      testButton: (selector: string) => chromeTests.testButton(() => self.getSend(), self.setContext.bind(self), selector),
    };
  }

  async initialize(): Promise<void> {
    if (!this.options.executablePath) this.executablePath = await setupFloorp();
    else this.executablePath = this.options.executablePath;
    this.browser = await foxr.launch({
      executablePath: this.executablePath,
      headless: this.options.headless ?? true,
      defaultViewport: this.options.defaultViewport ?? { width:1280, height:720 },
    });
    const pages = await this.browser.pages();
    this.page = pages[0] ?? await this.browser.newPage();
  }

  async navigate(url: string): Promise<EvaluateResult> {
    try {
      if (!this.page) throw new Error("Browser not initialized");
      await this.page.goto(url);
      return { success: true, value: await this.page.url() };
    } catch (e) { return { success:false, error:String(e) } }
  }

  async evaluate(script: string): Promise<EvaluateResult> {
    try {
      if (!this.page) throw new Error("Browser not initialized");
      return { success:true, value: await this.page.evaluate(script) };
    } catch (e) { return { success:false, error:String(e) } }
  }

  private async chromeEvaluate(script: string): Promise<EvaluateResult> {
    try {
      const send = this.getSend();
      if (!send) throw new Error("Browser not initialized");
      const prev = this.currentContext;
      await this.setContext("chrome");
      const result = await send("WebDriver:ExecuteScript", { script, args:[] }, "value");
      await this.setContext(prev);
      return { success:true, value: result };
    } catch (e) { return { success:false, error:String(e) } }
  }


  /**
   * Find element in chrome context (browser UI) and return metadata
   */
  private async chromeFindElement(selector: string): Promise<EvaluateResult> {
    try {
      const send = this.getSend();
      if (!send) throw new Error("Browser not initialized");
      const prev = this.currentContext;
      await this.setContext("chrome");
  
      const result = await send("WebDriver:ExecuteScript", {
        script: `
          var selector = arguments[0];
          var el = document.querySelector(selector);
          if (!el) {
            var win = Services.wm.getMostRecentWindow("navigator:browser");
            if (win && win.document) el = win.document.querySelector(selector);
          }
          if (!el) return { found: false, error: "Element not found: " + selector };
          var rect = el.getBoundingClientRect();
          return {
            found: true,
            tagName: el.tagName,
            id: el.id || null,
            className: el.className || null,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        `,
        args: [selector],
      }, "value");
  
      await this.setContext(prev);
      return { success: true, value: result };
    } catch (e) { return { success:false, error:String(e) } }
  }


  private async chromeScreenshot(options: ChromeScreenshotOptions = {}): Promise<ScreenshotResult> {
    try {
      const send = this.getSend();
      if (!send) throw new Error("Browser not initialized");
      const prev = this.currentContext;
      const ctx = options.context ?? "content";
      await this.setContext(ctx);
      let base64: string;
      if (options.selector && ctx === "chrome") {
        // prefer element screenshot, fallback to full
        try {
          const elId = await send("WebDriver:FindElement", { value: options.selector, using: "css selector" }) as Record<string,string>;
          base64 = await send("WebDriver:TakeScreenshot", { id: elId, full:false, hash:false }, "value") as string;
        } catch {
          base64 = await send("WebDriver:TakeScreenshot", { full:true, hash:false }, "value") as string;
        }
      } else if (options.fullWindow) {
        await this.setContext("chrome");
        base64 = await send("WebDriver:TakeScreenshot", { full:true, hash:false }, "value") as string;
      } else if (this.page && ctx === "content") {
        const buffer = await this.page.screenshot({ path: options.path });
        return { success:true, path: options.path, buffer };
      } else {
        base64 = await send("WebDriver:TakeScreenshot", { full:true, hash:false }, "value") as string;
      }
      await this.setContext(prev);
      const buffer = Buffer.from(base64, "base64");
      if (options.path) await import("node:fs").then(fs => fs.writeFileSync(options.path!, buffer));
      return { success:true, path: options.path, buffer };
    } catch (e) { return { success:false, error:String(e) } }
  }


  async screenshotFullWindow(path?: string) { return this.chromeScreenshot({ fullWindow:true, context:"chrome", path }) }
  
  // Page helpers
  async setContent(html: string): Promise<EvaluateResult> {
    try {
      if (!this.page) throw new Error("Browser not initialized");
      await this.page.setContent(html);
      return { success: true };
    } catch (e) { return { success:false, error:String(e) } }
  }
  
  async getUrl(): Promise<string | null> { return this.page ? await this.page.url() : null }
  async getTitle(): Promise<string | null> { return this.page ? await this.page.title() : null }
  async getContent(): Promise<string | null> { return this.page ? await this.page.content() : null }
  
  async findElement(selector: string): Promise<TElementHandle | null> {
    if (!this.page) return null;
    return await this.page.$(selector);
  }
  async findElements(selector: string): Promise<TElementHandle[]> {
    if (!this.page) return [];
    return await this.page.$$(selector);
  }
  async click(selector: string): Promise<EvaluateResult> {
    try {
      if (!this.page) throw new Error("Browser not initialized");
      const el = await this.page.$(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);
      await el.click();
      return { success: true };
    } catch (e) { return { success:false, error:String(e) } }
  }
  async type(selector: string, text: string): Promise<EvaluateResult> {
    try {
      if (!this.page) throw new Error("Browser not initialized");
      const el = await this.page.$(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);
      await el.type(text);
      return { success: true };
    } catch (e) { return { success:false, error:String(e) } }
  }
  async focus(selector: string): Promise<EvaluateResult> {
    try {
      if (!this.page) throw new Error("Browser not initialized");
      await this.page.focus(selector);
      return { success: true };
    } catch (e) { return { success:false, error:String(e) } }
  }
  
  // Content screenshot
  async screenshot(path?: string): Promise<ScreenshotResult> {
    try {
      if (!this.page) throw new Error("Browser not initialized");
      const buffer = await this.page.screenshot({ path });
      return { success: true, path, buffer };
    } catch (e) { return { success:false, error:String(e) } }
  }
  
  // High-level helpers (kept concise)
  
  async getCoverage(): Promise<EvaluateResult> {
    try {
      if (!this.page) throw new Error("Browser not initialized");
      const res = await this.page.evaluate(`(function(){ return { hasCoverage: !!window.__coverage__, coverage: window.__coverage__ || null }; })()`);
      return { success: true, value: res };
    } catch (e) { return { success:false, error:String(e) } }
  }
  
  // Pages
  async newPage(): Promise<TPage | null> { if (!this.browser) return null; const p = await this.browser.newPage(); this.page = p; return p }
  async getPages(): Promise<TPage[]> { if (!this.browser) return []; return await this.browser.pages() }
  
  getPage() { return this.page }
  getBrowser() { return this.browser }
  
  async close(): Promise<void> {
    if (!this.browser) return;
    await this.browser.close();
    this.browser = null; this.page = null;
  }
}

export default BrowserAutomation
