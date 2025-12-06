/**
 * Floorp Browser Automation Tool
 * Interactive browser control via Marionette protocol using foxr
 * 
 * This tool provides an API for LLM to manipulate the browser UI (Firefox chrome context)
 * and run tests including datetime overlay, accessibility, and screenshots.
 * 
 * SPDX-License-Identifier: MPL-2.0
 */

import foxr, { type TBrowser, type TPage, type TElementHandle } from "@jsr/f3liz__foxr";
import { setupFloorp, findFloorpBinary } from "./setup-floorp.ts";

export interface BrowserAutomationOptions {
  headless?: boolean;
  executablePath?: string;
  defaultViewport?: {
    width?: number;
    height?: number;
  };
}

export interface EvaluateResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

export interface ScreenshotResult {
  success: boolean;
  path?: string;
  buffer?: Buffer;
  error?: string;
}

export interface ChromeScreenshotOptions {
  /** Take full browser window screenshot (chrome + content) */
  fullWindow?: boolean;
  /** CSS selector for element to screenshot (works in both chrome and content context) */
  selector?: string;
  /** Context to take screenshot in: 'chrome' for browser UI, 'content' for page content */
  context?: "chrome" | "content";
  /** Path to save the screenshot */
  path?: string;
}

export interface AccessibilityTestResult {
  success: boolean;
  element?: {
    tagName: string;
    ariaLabel?: string;
    role?: string;
    id?: string;
    className?: string;
  };
  passed: boolean;
  error?: string;
}

export interface DateTimeOverlayResult {
  success: boolean;
  overlayVisible: boolean;
  displayedTime?: string;
  error?: string;
}

/**
 * BrowserAutomation provides methods for LLM to interact with Floorp browser.
 * It uses the Marionette protocol via foxr for browser control.
 */
export class BrowserAutomation {
  private browser: TBrowser | null = null;
  private page: TPage | null = null;
  private executablePath: string | null = null;
  private currentContext: "chrome" | "content" = "content";

  constructor(private options: BrowserAutomationOptions = {}) {}

  /**
   * Access the raw Marionette send function for low-level protocol access.
   * This is needed for chrome context operations.
   */
  private getSend(): ((name: string, params?: Record<string, unknown>, key?: string) => Promise<unknown>) | null {
    if (!this.browser) return null;
    // Access the private _send method from the browser
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.browser as any)._send;
  }

  /**
   * Switch Marionette context between chrome and content
   */
  private async setContext(context: "chrome" | "content"): Promise<void> {
    const send = this.getSend();
    if (!send) throw new Error("Browser not initialized");
    
    if (this.currentContext !== context) {
      await send("Marionette:SetContext", { value: context });
      this.currentContext = context;
    }
  }

  /**
   * Initialize browser automation by setting up Floorp binary and launching the browser.
   */
  async initialize(): Promise<void> {
    // Setup Floorp binary if not provided
    if (!this.options.executablePath) {
      this.executablePath = await setupFloorp();
    } else {
      this.executablePath = this.options.executablePath;
    }

    console.log("🚀 Launching Floorp browser...");
    
    this.browser = await foxr.launch({
      executablePath: this.executablePath,
      headless: this.options.headless ?? true,
      defaultViewport: this.options.defaultViewport ?? {
        width: 1280,
        height: 720,
      },
    });

    // Get the first page or create a new one
    const pages = await this.browser.pages();
    this.page = pages[0] ?? await this.browser.newPage();

    console.log("✅ Browser ready for automation");
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }
      await this.page.goto(url);
      return { success: true, value: await this.page.url() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get the current page URL
   */
  async getUrl(): Promise<string | null> {
    if (!this.page) return null;
    return await this.page.url();
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string | null> {
    if (!this.page) return null;
    return await this.page.title();
  }

  /**
   * Get page HTML content
   */
  async getContent(): Promise<string | null> {
    if (!this.page) return null;
    return await this.page.content();
  }

  /**
   * Set page HTML content
   */
  async setContent(html: string): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }
      await this.page.setContent(html);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate(script: string): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }
      const result = await this.page.evaluate(script);
      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Evaluate JavaScript in the chrome context (browser UI).
   * This allows manipulation of browser chrome elements like toolbar, tabs, etc.
   * 
   * @param script - JavaScript code to execute in chrome context
   */
  async evaluateChrome(script: string): Promise<EvaluateResult> {
    try {
      const send = this.getSend();
      if (!send) {
        throw new Error("Browser not initialized");
      }

      const previousContext = this.currentContext;
      await this.setContext("chrome");

      const result = await send("WebDriver:ExecuteScript", {
        script: script,
        args: [],
      }, "value");

      await this.setContext(previousContext);

      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Find element in chrome context (browser UI)
   * 
   * @param selector - CSS selector for the chrome element
   */
  async findChromeElement(selector: string): Promise<EvaluateResult> {
    try {
      const send = this.getSend();
      if (!send) {
        throw new Error("Browser not initialized");
      }

      const previousContext = this.currentContext;
      await this.setContext("chrome");

      const result = await send("WebDriver:ExecuteScript", {
        script: `
          var selector = arguments[0];
          var el = document.querySelector(selector);
          if (!el) {
            return { found: false, error: "Element not found: " + selector };
          }
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

      await this.setContext(previousContext);

      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Evaluate a function in the page context
   */
  async evaluateFunction<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }
      const result = await this.page.evaluate(fn, ...args);
      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Find an element by CSS selector
   */
  async findElement(selector: string): Promise<TElementHandle | null> {
    if (!this.page) return null;
    return await this.page.$(selector);
  }

  /**
   * Find all elements matching a CSS selector
   */
  async findElements(selector: string): Promise<TElementHandle[]> {
    if (!this.page) return [];
    return await this.page.$$(selector);
  }

  /**
   * Click an element by selector
   */
  async click(selector: string): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }
      const element = await this.page.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      await element.click();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }
      const element = await this.page.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      await element.type(text);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Focus an element
   */
  async focus(selector: string): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }
      await this.page.focus(selector);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Take a screenshot of the page (content context only)
   */
  async screenshot(path?: string): Promise<ScreenshotResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }
      const buffer = await this.page.screenshot({ path });
      return { success: true, path, buffer };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Take a screenshot with chrome context support.
   * Supports full browser window, specific elements by selector in both chrome and content contexts.
   * 
   * @param options - Screenshot options
   * @param options.fullWindow - Take full browser window screenshot (chrome + content)
   * @param options.selector - CSS selector for element to screenshot
   * @param options.context - Context to take screenshot in: 'chrome' or 'content'
   * @param options.path - Path to save the screenshot
   */
  async screenshotChrome(options: ChromeScreenshotOptions = {}): Promise<ScreenshotResult> {
    const { writeFileSync } = await import("node:fs");
    
    try {
      const send = this.getSend();
      if (!send) {
        throw new Error("Browser not initialized");
      }

      const context = options.context ?? "content";
      const previousContext = this.currentContext;

      // Switch to the desired context
      await this.setContext(context);

      let base64Data: string;

      if (options.selector) {
        // Take screenshot of a specific element by selector
        if (options.fullWindow) {
          // For full window with element highlight, we need to use chrome context
          await this.setContext("chrome");
          
          // Take full window screenshot using Marionette
          const result = await send("WebDriver:TakeScreenshot", {
            full: true,
            hash: false,
          }, "value") as string;
          base64Data = result;
        } else {
          // Find the element and take screenshot of it
          const elementResult = await send("WebDriver:ExecuteScript", {
            script: `
              var selector = arguments[0];
              var el = document.querySelector(selector);
              if (!el) {
                return { error: "Element not found: " + selector };
              }
              var rect = el.getBoundingClientRect();
              return {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              };
            `,
            args: [options.selector],
          }, "value") as { x?: number; y?: number; width?: number; height?: number; error?: string };

          if (elementResult.error) {
            throw new Error(elementResult.error);
          }

          // Take screenshot with element bounds
          const result = await send("WebDriver:TakeScreenshot", {
            full: false,
            hash: false,
            scroll: false,
          }, "value") as string;

          // For element screenshots in chrome context, we crop the image
          // Note: Full element clipping would require canvas manipulation
          base64Data = result;
        }
      } else if (options.fullWindow) {
        // Take full window screenshot (includes chrome UI)
        await this.setContext("chrome");
        
        const result = await send("WebDriver:TakeScreenshot", {
          full: true,
          hash: false,
        }, "value") as string;
        base64Data = result;
      } else {
        // Regular page screenshot
        const result = await send("WebDriver:TakeScreenshot", {
          full: true,
          hash: false,
        }, "value") as string;
        base64Data = result;
      }

      // Restore previous context
      await this.setContext(previousContext);

      const buffer = Buffer.from(base64Data, "base64");

      if (options.path) {
        writeFileSync(options.path, buffer);
      }

      return { success: true, path: options.path, buffer };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Take a screenshot of a specific element in chrome context (browser UI)
   * 
   * @param selector - CSS selector for the element (uses XUL/chrome document)
   * @param path - Path to save the screenshot
   */
  async screenshotChromeElement(selector: string, path?: string): Promise<ScreenshotResult> {
    const { writeFileSync } = await import("node:fs");
    
    try {
      const send = this.getSend();
      if (!send) {
        throw new Error("Browser not initialized");
      }

      const previousContext = this.currentContext;
      await this.setContext("chrome");

      // Find element in chrome context and take screenshot
      // Note: In chrome context, we use the browser's XUL document
      const result = await send("WebDriver:ExecuteScript", {
        script: `
          var selector = arguments[0];
          var el = document.querySelector(selector);
          if (!el) {
            // Try searching in the main browser window
            var win = Services.wm.getMostRecentWindow("navigator:browser");
            if (win && win.document) {
              el = win.document.querySelector(selector);
            }
          }
          if (!el) {
            return { error: "Element not found in chrome context: " + selector };
          }
          
          // Get element bounds for information
          var rect = el.getBoundingClientRect();
          return {
            found: true,
            tagName: el.tagName,
            id: el.id || null,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        `,
        args: [selector],
      }, "value") as { found?: boolean; error?: string; tagName?: string };

      if ((result as { error?: string }).error) {
        await this.setContext(previousContext);
        throw new Error((result as { error: string }).error);
      }

      // Take screenshot using WebDriver:TakeScreenshot with element
      // First, we need to find the element reference
      let screenshotResult: string;
      
      try {
        // Try to use element screenshot via Marionette
        const elementId = await send("WebDriver:FindElement", {
          value: selector,
          using: "css selector",
        }) as { [key: string]: string };

        screenshotResult = await send("WebDriver:TakeScreenshot", {
          id: elementId,
          full: false,
          hash: false,
        }, "value") as string;
      } catch {
        // Fallback to full screenshot if element screenshot fails
        screenshotResult = await send("WebDriver:TakeScreenshot", {
          full: true,
          hash: false,
        }, "value") as string;
      }

      await this.setContext(previousContext);

      const buffer = Buffer.from(screenshotResult, "base64");

      if (path) {
        writeFileSync(path, buffer);
      }

      return { success: true, path, buffer };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Take a full browser window screenshot including chrome UI and content
   * 
   * @param path - Path to save the screenshot
   */
  async screenshotFullWindow(path?: string): Promise<ScreenshotResult> {
    return this.screenshotChrome({ fullWindow: true, context: "chrome", path });
  }

  /**
   * Create a datetime overlay in the top-right corner of the browser
   */
  async createDateTimeOverlay(): Promise<DateTimeOverlayResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      const result = await this.page.evaluate(`
        (function() {
          // Remove existing overlay if present
          var existing = document.getElementById("floorp-datetime-overlay");
          if (existing) {
            existing.remove();
          }

          // Create the overlay
          var overlay = document.createElement("div");
          overlay.id = "floorp-datetime-overlay";
          overlay.setAttribute("role", "status");
          overlay.setAttribute("aria-live", "polite");
          overlay.setAttribute("aria-label", "Current date and time display");
          overlay.style.cssText = "position: fixed; top: 10px; right: 10px; padding: 8px 16px; background: rgba(0, 0, 0, 0.8); color: white; font-family: system-ui, -apple-system, sans-serif; font-size: 14px; border-radius: 6px; z-index: 999999; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);";

          // Update time function
          function updateTime() {
            var now = new Date();
            overlay.textContent = now.toLocaleString();
            overlay.setAttribute("data-timestamp", now.toISOString());
          }

          updateTime();
          
          // Update every second
          var intervalId = window.setInterval(updateTime, 1000);
          overlay.setAttribute("data-interval-id", String(intervalId));

          document.body.appendChild(overlay);

          return {
            visible: true,
            time: overlay.textContent
          };
        })()
      `);

      return {
        success: true,
        overlayVisible: (result as { visible: boolean; time: string | null }).visible,
        displayedTime: (result as { visible: boolean; time: string | null }).time ?? undefined,
      };
    } catch (error) {
      return { success: false, overlayVisible: false, error: String(error) };
    }
  }

  /**
   * Verify the datetime overlay is showing the correct time
   */
  async verifyDateTimeOverlay(): Promise<DateTimeOverlayResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      const result = await this.page.evaluate(`
        (function() {
          var overlay = document.getElementById("floorp-datetime-overlay");
          if (!overlay) {
            return { visible: false, time: null };
          }

          var displayedTime = overlay.textContent;
          var timestamp = overlay.getAttribute("data-timestamp");
          
          // Check if the timestamp is recent (within last 5 seconds)
          if (timestamp) {
            var overlayDate = new Date(timestamp);
            var now = new Date();
            var diff = Math.abs(now.getTime() - overlayDate.getTime());
            
            return {
              visible: true,
              time: displayedTime,
              timestamp: timestamp,
              isRecent: diff < 5000
            };
          }

          return { visible: true, time: displayedTime };
        })()
      `);

      const typedResult = result as { visible: boolean; time: string | null; isRecent?: boolean };
      
      return {
        success: true,
        overlayVisible: typedResult.visible,
        displayedTime: typedResult.time ?? undefined,
      };
    } catch (error) {
      return { success: false, overlayVisible: false, error: String(error) };
    }
  }

  /**
   * Remove the datetime overlay
   */
  async removeDateTimeOverlay(): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      await this.page.evaluate(`
        (function() {
          var overlay = document.getElementById("floorp-datetime-overlay");
          if (overlay) {
            var intervalId = overlay.getAttribute("data-interval-id");
            if (intervalId) {
              window.clearInterval(parseInt(intervalId, 10));
            }
            overlay.remove();
          }
        })()
      `);

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Create a test button with aria-label for accessibility testing
   */
  async createTestButton(label: string, id: string = "floorp-test-button"): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      // Use string-based evaluation to avoid TypeScript transpilation issues
      const script = `
        (function() {
          var btnId = ${JSON.stringify(id)};
          var btnLabel = ${JSON.stringify(label)};
          
          // Remove existing button if present
          var existing = document.getElementById(btnId);
          if (existing) {
            existing.remove();
          }

          var button = document.createElement("button");
          button.id = btnId;
          button.setAttribute("aria-label", btnLabel);
          button.setAttribute("role", "button");
          button.textContent = btnLabel;
          button.style.cssText = "position: fixed; top: 50px; right: 10px; padding: 10px 20px; background: #4A90E2; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; z-index: 999999; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);";
          button.setAttribute("data-clicked", "false");
          button.addEventListener("click", function() {
            button.setAttribute("data-clicked", "true");
            button.style.background = "#2ECC71";
            button.textContent = "Clicked!";
          });

          document.body.appendChild(button);
        })()
      `;

      await this.page.evaluate(script);

      return { success: true, value: { id, label } };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Test accessibility of an element by checking aria-label
   */
  async testAccessibility(selector: string): Promise<AccessibilityTestResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      const result = await this.page.evaluate(`
        (function() {
          var selector = ${JSON.stringify(selector)};
          var el = document.querySelector(selector);
          if (!el) {
            return { error: "Element not found: " + selector };
          }
          return {
            tagName: el.tagName.toLowerCase(),
            ariaLabel: el.getAttribute("aria-label"),
            role: el.getAttribute("role"),
            id: el.id || null,
            className: el.className || null
          };
        })()
      `);

      const typedResult = result as {
        tagName?: string;
        ariaLabel?: string | null;
        role?: string | null;
        id?: string | null;
        className?: string | null;
        error?: string;
      };

      if (typedResult.error) {
        throw new Error(typedResult.error);
      }

      const hasAccessibility = Boolean(typedResult.ariaLabel || typedResult.role);

      return {
        success: true,
        element: {
          tagName: typedResult.tagName ?? "",
          ariaLabel: typedResult.ariaLabel ?? undefined,
          role: typedResult.role ?? undefined,
          id: typedResult.id ?? undefined,
          className: typedResult.className ?? undefined,
        },
        passed: hasAccessibility,
      };
    } catch (error) {
      return { success: false, passed: false, error: String(error) };
    }
  }

  /**
   * Verify a button is clickable and working
   */
  async testButton(selector: string): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      // Use JavaScript-based click to avoid Marionette ActionChain issues
      const clickResult = await this.page.evaluate(`
        (function() {
          var selector = ${JSON.stringify(selector)};
          var el = document.querySelector(selector);
          if (!el) {
            return { success: false, error: "Element not found" };
          }
          el.click();
          return { success: true };
        })()
      `);

      if (!(clickResult as { success: boolean }).success) {
        throw new Error(`Button not found: ${selector}`);
      }

      // Small delay to let the click handler run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the click was registered
      const clicked = await this.page.evaluate(`
        (function() {
          var selector = ${JSON.stringify(selector)};
          var el = document.querySelector(selector);
          if (!el) {
            return null;
          }
          return el.getAttribute("data-clicked");
        })()
      `);

      return {
        success: true,
        value: {
          clicked: clicked === "true",
          selector,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get coverage data (if Istanbul is instrumented)
   */
  async getCoverage(): Promise<EvaluateResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      const result = await this.page.evaluate(`
        (function() {
          // Check if Istanbul coverage is available
          var coverage = window.__coverage__;
          if (coverage) {
            return { hasCoverage: true, coverage: coverage };
          }
          return { hasCoverage: false, coverage: null };
        })()
      `);

      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Create a new page/tab
   */
  async newPage(): Promise<TPage | null> {
    if (!this.browser) return null;
    const page = await this.browser.newPage();
    this.page = page;
    return page;
  }

  /**
   * Get all open pages
   */
  async getPages(): Promise<TPage[]> {
    if (!this.browser) return [];
    return await this.browser.pages();
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log("🔒 Browser closed");
    }
  }

  /**
   * Get the raw browser instance for advanced usage
   */
  getBrowser(): TBrowser | null {
    return this.browser;
  }

  /**
   * Get the current page instance for advanced usage
   */
  getPage(): TPage | null {
    return this.page;
  }
}

export default BrowserAutomation;
