/**
 * Browser-chrome context testing helpers for Floorp.
 *
 * This module provides helpers for testing browser UI (chrome context)
 * using the Marionette protocol via foxr.
 *
 * Key points for maintainers:
 * - Most WebDriver methods don't work in chrome context
 * - Use JS execution through Marionette for UI manipulation
 * - The chrome context gives access to browser internals (gBrowser, document, etc.)
 */

import foxr from '@jsr/f3liz__foxr';
import { EventEmitter } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Context enum (matching foxr's internal enum)
const Context = {
  CHROME: 'chrome',
  CONTENT: 'content'
};

/**
 * BrowserChromeHelper - Helpers for testing in browser-chrome context.
 *
 * This class wraps foxr to provide convenient methods for:
 * - Executing JS in chrome context (browser UI)
 * - Taking screenshots
 * - Manipulating browser UI elements
 * - Accessibility testing
 */
export class BrowserChromeHelper extends EventEmitter {
  constructor() {
    super();
    this._foxr = foxr; // foxr exports a singleton instance
    this._browser = null;
    this._send = null;
  }

  /**
   * Connect to a running browser instance.
   *
   * The browser must be started with marionette enabled:
   *   floorp -marionette
   *
   * @param {object} options - Connection options
   * @param {string} options.host - Marionette host (default: localhost)
   * @param {number} options.port - Marionette port (default: 2828)
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    const { host = 'localhost', port = 2828 } = options;
    console.log(`Connecting to browser at ${host}:${port}...`);

    this._browser = await this._foxr.connect({ host, port });
    // Get the send function from the browser's internal state
    this._send = this._browser._send;

    console.log('Connected to browser.');
    return this._browser;
  }

  /**
   * Launch a browser instance with marionette enabled.
   *
   * @param {object} options - Launch options
   * @param {string} options.executablePath - Path to the browser executable
   * @param {boolean} options.headless - Run in headless mode (default: false)
   * @param {string[]} options.args - Additional command line arguments
   * @returns {Promise<void>}
   */
  async launch(options = {}) {
    const { executablePath, headless = false, args = [] } = options;

    if (!executablePath) {
      throw new Error('executablePath is required');
    }

    console.log(`Launching browser from: ${executablePath}`);

    this._browser = await this._foxr.launch({
      executablePath,
      headless,
      args,
      dumpio: true
    });
    this._send = this._browser._send;

    console.log('Browser launched.');
    return this._browser;
  }

  /**
   * Switch to chrome context for browser UI testing.
   *
   * In chrome context, you have access to:
   * - document: The browser's XUL document
   * - gBrowser: The global browser object
   * - window: The browser window
   * - ChromeUtils, Services, etc.
   *
   * @returns {Promise<void>}
   */
  async switchToChromeContext() {
    await this._send('Marionette:SetContext', { value: Context.CHROME });
    console.log('Switched to chrome context.');
  }

  /**
   * Switch back to content context (web page).
   *
   * @returns {Promise<void>}
   */
  async switchToContentContext() {
    await this._send('Marionette:SetContext', { value: Context.CONTENT });
    console.log('Switched to content context.');
  }

  /**
   * Execute JavaScript in the current context.
   *
   * In chrome context, this runs in the browser UI.
   * The script has access to all browser APIs.
   *
   * @param {string|Function} script - Script to execute or function
   * @param {any[]} args - Arguments to pass to the script
   * @returns {Promise<any>} - Result of the script
   */
  async executeScript(script, args = []) {
    const scriptString = typeof script === 'function' ? script.toString() : script;

    // For chrome context, we use a synchronous script execution
    const result = await this._send('WebDriver:ExecuteScript', {
      script: typeof script === 'function'
        ? `return (${scriptString})(...arguments)`
        : scriptString,
      args
    }, 'value');

    return result;
  }

  /**
   * Execute JavaScript asynchronously in the current context.
   *
   * The script receives a resolve function as the last argument.
   * Call resolve(value) to return a value.
   *
   * @param {string|Function} script - Script to execute
   * @param {any[]} args - Arguments to pass to the script
   * @returns {Promise<any>} - Result of the script
   */
  async executeAsyncScript(script, args = []) {
    const scriptString = typeof script === 'function' ? script.toString() : script;

    const result = await this._send('WebDriver:ExecuteAsyncScript', {
      script: `
        const args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
        const resolve = arguments[arguments.length - 1];

        Promise.resolve()
          .then(() => (${scriptString})(...args))
          .then((value) => resolve({ error: null, value }))
          .catch((error) => resolve({ error: error instanceof Error ? error.message : String(error) }))
      `,
      args
    }, 'value');

    if (result && result.error) {
      throw new Error(`Script execution failed: ${result.error}`);
    }

    return result ? result.value : undefined;
  }

  /**
   * Take a screenshot of the browser window.
   *
   * @param {object} options - Screenshot options
   * @param {string} options.path - Path to save the screenshot
   * @param {boolean} options.fullPage - Capture full page (default: true)
   * @returns {Promise<Buffer>} - Screenshot as a Buffer
   */
  async screenshot(options = {}) {
    const { path, fullPage = true } = options;

    const result = await this._send('WebDriver:TakeScreenshot', {
      full: fullPage,
      hash: false
    }, 'value');

    const buffer = Buffer.from(result, 'base64');

    if (path) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer);
      console.log(`Screenshot saved to: ${path}`);
    }

    return buffer;
  }

  /**
   * Query for an element in the chrome document using CSS selector.
   *
   * @param {string} selector - CSS selector
   * @returns {Promise<object|null>} - Element info or null if not found
   */
  async queryChromeSelector(selector) {
    await this.switchToChromeContext();

    const result = await this.executeScript(`
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) return null;
      return {
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        textContent: el.textContent ? el.textContent.substring(0, 100) : '',
        ariaLabel: el.getAttribute('aria-label'),
        visible: el.checkVisibility ? el.checkVisibility() : true
      };
    `);

    return result;
  }

  /**
   * Check accessibility attributes of an element.
   *
   * @param {string} selector - CSS selector for the element
   * @returns {Promise<object>} - Accessibility info
   */
  async checkAccessibility(selector) {
    await this.switchToChromeContext();

    const result = await this.executeScript(`
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) {
        return { error: 'Element not found', selector: '${selector}' };
      }

      return {
        tagName: el.tagName,
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaDescribedBy: el.getAttribute('aria-describedby'),
        ariaLabelledBy: el.getAttribute('aria-labelledby'),
        ariaHidden: el.getAttribute('aria-hidden'),
        tabIndex: el.tabIndex,
        title: el.title,
        hasAccessibleName: !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title),
        isInteractive: ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ||
                       el.hasAttribute('onclick') ||
                       el.tabIndex >= 0
      };
    `);

    return result;
  }

  /**
   * Click on an element in the chrome document.
   *
   * @param {string} selector - CSS selector for the element to click
   * @returns {Promise<boolean>} - True if click succeeded
   */
  async clickChromeElement(selector) {
    await this.switchToChromeContext();

    const result = await this.executeScript(`
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) {
        return { success: false, error: 'Element not found' };
      }
      el.click();
      return { success: true };
    `);

    if (!result.success) {
      throw new Error(`Click failed: ${result.error}`);
    }

    return true;
  }

  /**
   * Insert HTML into the chrome document.
   * Useful for creating test overlays.
   *
   * @param {string} parentSelector - CSS selector for parent element
   * @param {string} html - HTML to insert
   * @param {string} position - Insert position: 'beforeend', 'afterbegin', etc.
   * @returns {Promise<void>}
   */
  async insertChromeHTML(parentSelector, html, position = 'beforeend') {
    await this.switchToChromeContext();

    await this.executeScript(`
      const parent = document.querySelector('${parentSelector.replace(/'/g, "\\'")}');
      if (!parent) {
        throw new Error('Parent element not found: ${parentSelector}');
      }
      parent.insertAdjacentHTML('${position}', \`${html.replace(/`/g, '\\`')}\`);
    `);
  }

  /**
   * Remove an element from the chrome document.
   *
   * @param {string} selector - CSS selector for the element to remove
   * @returns {Promise<boolean>} - True if element was removed
   */
  async removeChromeElement(selector) {
    await this.switchToChromeContext();

    const result = await this.executeScript(`
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (el) {
        el.remove();
        return true;
      }
      return false;
    `);

    return result;
  }

  /**
   * Get the current datetime formatted for display.
   * Useful for creating datetime overlays.
   *
   * @returns {Promise<string>} - Current datetime string
   */
  async getCurrentDatetime() {
    await this.switchToChromeContext();

    const result = await this.executeScript(`
      return new Date().toLocaleString();
    `);

    return result;
  }

  /**
   * Close the browser connection.
   *
   * @param {boolean} quitBrowser - Also quit the browser process (default: false)
   * @returns {Promise<void>}
   */
  async close(quitBrowser = false) {
    if (this._browser) {
      if (quitBrowser) {
        await this._browser.close();
      } else {
        await this._browser.disconnect();
      }
      this._browser = null;
      this._send = null;
      console.log('Disconnected from browser.');
    }
  }
}

/**
 * Create and return a new BrowserChromeHelper instance.
 *
 * @returns {BrowserChromeHelper}
 */
export function createHelper() {
  return new BrowserChromeHelper();
}

export default BrowserChromeHelper;
