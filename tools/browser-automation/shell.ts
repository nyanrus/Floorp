#!/usr/bin/env npx ts-node
/**
 * Floorp Browser Interactive Shell
 * Interactive CLI for LLM to control and test the browser
 * 
 * SPDX-License-Identifier: MPL-2.0
 */

import { createInterface } from "node:readline";
import { BrowserAutomation } from "./browser-automation.ts";

const HELP_TEXT = `
Floorp Browser Interactive Shell - Commands
============================================

Navigation:
  navigate <url>          - Navigate to a URL
  back                    - Go back in history
  forward                 - Go forward in history
  url                     - Get current URL
  title                   - Get page title

Content:
  content                 - Get page HTML content
  setcontent <html>       - Set page HTML content
  eval <script>           - Evaluate JavaScript in page context
  eval-chrome <script>    - Evaluate JavaScript in chrome context (browser UI)

Elements:
  find <selector>         - Find element by CSS selector
  find-chrome <selector>  - Find element in chrome context
  click <selector>        - Click an element
  type <selector> <text>  - Type text into an element
  focus <selector>        - Focus an element

Testing:
  datetime                - Create datetime overlay
  verify-datetime         - Verify datetime overlay is correct
  remove-datetime         - Remove datetime overlay
  button <label> [id]     - Create a test button
  test-button <selector>  - Test if button is clickable
  accessibility <selector>- Test accessibility of element
  coverage                - Get Istanbul coverage data

Screenshots:
  screenshot [path]           - Take a screenshot of page content
  screenshot-full [path]      - Take full browser window screenshot (chrome + content)
  screenshot-chrome <selector> [path] - Take screenshot of chrome element

Browser:
  newpage                 - Create a new page/tab
  pages                   - List all open pages
  close                   - Close the browser
  help                    - Show this help
  exit                    - Exit the shell
`;

class InteractiveShell {
  private automation: BrowserAutomation;
  private rl: ReturnType<typeof createInterface>;
  private running = true;

  constructor(options: { headless?: boolean } = {}) {
    this.automation = new BrowserAutomation({
      headless: options.headless ?? true,
      defaultViewport: { width: 1280, height: 720 },
    });

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start(): Promise<void> {
    console.log("🌐 Floorp Browser Interactive Shell");
    console.log("====================================");
    console.log("Type 'help' for available commands\n");

    try {
      await this.automation.initialize();
    } catch (error) {
      console.error("❌ Failed to initialize browser:", error);
      process.exit(1);
    }

    this.prompt();
  }

  private prompt(): void {
    if (!this.running) return;

    this.rl.question("floorp> ", async (input) => {
      const trimmed = input.trim();
      if (trimmed) {
        await this.handleCommand(trimmed);
      }
      this.prompt();
    });
  }

  private async handleCommand(input: string): Promise<void> {
    const parts = input.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (command) {
        case "help":
          console.log(HELP_TEXT);
          break;

        case "exit":
        case "quit":
          this.running = false;
          await this.automation.close();
          this.rl.close();
          console.log("Goodbye! 👋");
          process.exit(0);
          break;

        case "navigate":
          if (!args[0]) {
            console.log("Usage: navigate <url>");
            break;
          }
          const navResult = await this.automation.navigate(args[0]);
          console.log(navResult.success ? `✅ Navigated to: ${navResult.value}` : `❌ ${navResult.error}`);
          break;

        case "url":
          const url = await this.automation.getUrl();
          console.log(`URL: ${url}`);
          break;

        case "title":
          const title = await this.automation.getTitle();
          console.log(`Title: ${title}`);
          break;

        case "content":
          const content = await this.automation.getContent();
          console.log(content?.substring(0, 500) + (content && content.length > 500 ? "..." : ""));
          break;

        case "setcontent":
          if (!args[0]) {
            console.log("Usage: setcontent <html>");
            break;
          }
          const setResult = await this.automation.setContent(args.join(" "));
          console.log(setResult.success ? "✅ Content set" : `❌ ${setResult.error}`);
          break;

        case "eval":
          if (!args[0]) {
            console.log("Usage: eval <script>");
            break;
          }
          const evalResult = await this.automation.evaluate(args.join(" "));
          console.log(evalResult.success ? `Result: ${JSON.stringify(evalResult.value)}` : `❌ ${evalResult.error}`);
          break;

        case "eval-chrome":
          if (!args[0]) {
            console.log("Usage: eval-chrome <script>");
            break;
          }
          const evalChromeResult = await this.automation.evaluateChrome(args.join(" "));
          console.log(evalChromeResult.success ? `Result: ${JSON.stringify(evalChromeResult.value)}` : `❌ ${evalChromeResult.error}`);
          break;

        case "find":
          if (!args[0]) {
            console.log("Usage: find <selector>");
            break;
          }
          const element = await this.automation.findElement(args[0]);
          console.log(element ? "✅ Element found" : "❌ Element not found");
          break;

        case "find-chrome":
          if (!args[0]) {
            console.log("Usage: find-chrome <selector>");
            break;
          }
          const chromeElement = await this.automation.findChromeElement(args[0]);
          if (chromeElement.success) {
            console.log(`✅ Chrome element: ${JSON.stringify(chromeElement.value, null, 2)}`);
          } else {
            console.log(`❌ ${chromeElement.error}`);
          }
          break;

        case "click":
          if (!args[0]) {
            console.log("Usage: click <selector>");
            break;
          }
          const clickResult = await this.automation.click(args[0]);
          console.log(clickResult.success ? "✅ Clicked" : `❌ ${clickResult.error}`);
          break;

        case "type":
          if (args.length < 2) {
            console.log("Usage: type <selector> <text>");
            break;
          }
          const typeResult = await this.automation.type(args[0], args.slice(1).join(" "));
          console.log(typeResult.success ? "✅ Typed" : `❌ ${typeResult.error}`);
          break;

        case "focus":
          if (!args[0]) {
            console.log("Usage: focus <selector>");
            break;
          }
          const focusResult = await this.automation.focus(args[0]);
          console.log(focusResult.success ? "✅ Focused" : `❌ ${focusResult.error}`);
          break;

        case "datetime":
          const dtResult = await this.automation.createDateTimeOverlay();
          console.log(dtResult.success 
            ? `✅ DateTime overlay created. Time: ${dtResult.displayedTime}` 
            : `❌ ${dtResult.error}`);
          break;

        case "verify-datetime":
          const verifyResult = await this.automation.verifyDateTimeOverlay();
          console.log(verifyResult.success && verifyResult.overlayVisible
            ? `✅ DateTime overlay verified. Time: ${verifyResult.displayedTime}`
            : `❌ DateTime overlay not visible or ${verifyResult.error}`);
          break;

        case "remove-datetime":
          const removeResult = await this.automation.removeDateTimeOverlay();
          console.log(removeResult.success ? "✅ DateTime overlay removed" : `❌ ${removeResult.error}`);
          break;

        case "button":
          if (!args[0]) {
            console.log("Usage: button <label> [id]");
            break;
          }
          const buttonResult = await this.automation.createTestButton(args[0], args[1]);
          console.log(buttonResult.success 
            ? `✅ Button created: ${JSON.stringify(buttonResult.value)}` 
            : `❌ ${buttonResult.error}`);
          break;

        case "test-button":
          if (!args[0]) {
            console.log("Usage: test-button <selector>");
            break;
          }
          const testBtnResult = await this.automation.testButton(args[0]);
          console.log(testBtnResult.success 
            ? `✅ Button test: ${JSON.stringify(testBtnResult.value)}` 
            : `❌ ${testBtnResult.error}`);
          break;

        case "accessibility":
          if (!args[0]) {
            console.log("Usage: accessibility <selector>");
            break;
          }
          const a11yResult = await this.automation.testAccessibility(args[0]);
          if (a11yResult.success) {
            console.log(`Element: ${JSON.stringify(a11yResult.element, null, 2)}`);
            console.log(a11yResult.passed ? "✅ Accessibility test PASSED" : "❌ Accessibility test FAILED");
          } else {
            console.log(`❌ ${a11yResult.error}`);
          }
          break;

        case "coverage":
          const covResult = await this.automation.getCoverage();
          if (covResult.success) {
            const cov = covResult.value as { hasCoverage: boolean; coverage: unknown };
            console.log(cov.hasCoverage 
              ? `✅ Coverage data available (${Object.keys(cov.coverage as object).length} files)` 
              : "ℹ️ No Istanbul coverage data found");
          } else {
            console.log(`❌ ${covResult.error}`);
          }
          break;

        case "screenshot":
          const ssPath = args[0] || `screenshot-${Date.now()}.png`;
          const ssResult = await this.automation.screenshot(ssPath);
          console.log(ssResult.success ? `✅ Screenshot saved: ${ssPath}` : `❌ ${ssResult.error}`);
          break;

        case "screenshot-full":
          const ssFullPath = args[0] || `screenshot-full-${Date.now()}.png`;
          const ssFullResult = await this.automation.screenshotFullWindow(ssFullPath);
          console.log(ssFullResult.success ? `✅ Full window screenshot saved: ${ssFullPath}` : `❌ ${ssFullResult.error}`);
          break;

        case "screenshot-chrome":
          if (!args[0]) {
            console.log("Usage: screenshot-chrome <selector> [path]");
            break;
          }
          const ssChromeSelector = args[0];
          const ssChromePath = args[1] || `screenshot-chrome-${Date.now()}.png`;
          const ssChromeResult = await this.automation.screenshotChromeElement(ssChromeSelector, ssChromePath);
          console.log(ssChromeResult.success ? `✅ Chrome element screenshot saved: ${ssChromePath}` : `❌ ${ssChromeResult.error}`);
          break;
          break;

        case "newpage":
          const newPage = await this.automation.newPage();
          console.log(newPage ? "✅ New page created" : "❌ Failed to create page");
          break;

        case "pages":
          const pages = await this.automation.getPages();
          console.log(`Open pages: ${pages.length}`);
          break;

        case "close":
          await this.automation.close();
          console.log("✅ Browser closed");
          break;

        default:
          console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
      }
    } catch (error) {
      console.error("❌ Error:", error);
    }
  }
}

// Run if executed directly
const headless = !process.argv.includes("--headed");
const shell = new InteractiveShell({ headless });
shell.start().catch(console.error);
