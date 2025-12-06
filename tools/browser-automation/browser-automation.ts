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

  constructor(private options: BrowserAutomationOptions = {}) {}

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
   * Take a screenshot of the page
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
   * Create a datetime overlay in the top-right corner of the browser
   */
  async createDateTimeOverlay(): Promise<DateTimeOverlayResult> {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized");
      }

      const result = await this.page.evaluate(() => {
        // Remove existing overlay if present
        const existing = document.getElementById("floorp-datetime-overlay");
        if (existing) {
          existing.remove();
        }

        // Create the overlay
        const overlay = document.createElement("div");
        overlay.id = "floorp-datetime-overlay";
        overlay.setAttribute("role", "status");
        overlay.setAttribute("aria-live", "polite");
        overlay.setAttribute("aria-label", "Current date and time display");
        overlay.style.cssText = `
          position: fixed;
          top: 10px;
          right: 10px;
          padding: 8px 16px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          border-radius: 6px;
          z-index: 999999;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        `;

        // Update time function
        function updateTime() {
          const now = new Date();
          overlay.textContent = now.toLocaleString();
          overlay.setAttribute("data-timestamp", now.toISOString());
        }

        updateTime();
        
        // Update every second
        const intervalId = window.setInterval(updateTime, 1000);
        overlay.setAttribute("data-interval-id", String(intervalId));

        document.body.appendChild(overlay);

        return {
          visible: true,
          time: overlay.textContent,
        };
      });

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

      const result = await this.page.evaluate(() => {
        const overlay = document.getElementById("floorp-datetime-overlay");
        if (!overlay) {
          return { visible: false, time: null };
        }

        const displayedTime = overlay.textContent;
        const timestamp = overlay.getAttribute("data-timestamp");
        
        // Check if the timestamp is recent (within last 5 seconds)
        if (timestamp) {
          const overlayDate = new Date(timestamp);
          const now = new Date();
          const diff = Math.abs(now.getTime() - overlayDate.getTime());
          
          return {
            visible: true,
            time: displayedTime,
            timestamp,
            isRecent: diff < 5000,
          };
        }

        return { visible: true, time: displayedTime };
      });

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

      await this.page.evaluate(() => {
        const overlay = document.getElementById("floorp-datetime-overlay");
        if (overlay) {
          const intervalId = overlay.getAttribute("data-interval-id");
          if (intervalId) {
            window.clearInterval(parseInt(intervalId, 10));
          }
          overlay.remove();
        }
      });

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

      await this.page.evaluate((btnLabel: string, btnId: string) => {
        // Remove existing button if present
        const existing = document.getElementById(btnId);
        if (existing) {
          existing.remove();
        }

        const button = document.createElement("button");
        button.id = btnId;
        button.setAttribute("aria-label", btnLabel);
        button.setAttribute("role", "button");
        button.textContent = btnLabel;
        button.style.cssText = `
          position: fixed;
          top: 50px;
          right: 10px;
          padding: 10px 20px;
          background: #4A90E2;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          z-index: 999999;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        `;
        button.setAttribute("data-clicked", "false");
        button.addEventListener("click", () => {
          button.setAttribute("data-clicked", "true");
          button.style.background = "#2ECC71";
          button.textContent = "Clicked!";
        });

        document.body.appendChild(button);
      }, label, id);

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

      const result = await this.page.$eval(selector, (el: Element) => {
        const htmlEl = el as HTMLElement;
        return {
          tagName: el.tagName.toLowerCase(),
          ariaLabel: htmlEl.getAttribute("aria-label"),
          role: htmlEl.getAttribute("role"),
          id: htmlEl.id || null,
          className: htmlEl.className || null,
        };
      });

      const typedResult = result as {
        tagName: string;
        ariaLabel: string | null;
        role: string | null;
        id: string | null;
        className: string | null;
      };

      const hasAccessibility = Boolean(typedResult.ariaLabel || typedResult.role);

      return {
        success: true,
        element: {
          tagName: typedResult.tagName,
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

      // Click the button
      const element = await this.page.$(selector);
      if (!element) {
        throw new Error(`Button not found: ${selector}`);
      }

      await element.click();

      // Small delay to let the click handler run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the click was registered
      const clicked = await this.page.$eval(selector, (el: Element) => {
        return (el as HTMLElement).getAttribute("data-clicked");
      });

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

      const result = await this.page.evaluate(() => {
        // Check if Istanbul coverage is available
        const coverage = (window as unknown as { __coverage__?: unknown }).__coverage__;
        if (coverage) {
          return { hasCoverage: true, coverage };
        }
        return { hasCoverage: false, coverage: null };
      });

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
