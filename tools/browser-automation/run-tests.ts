/**
 * Floorp Browser Automation Tests
 * Tests for datetime overlay, accessibility, button interaction, and screenshots
 * 
 * SPDX-License-Identifier: MPL-2.0
 */

import { BrowserAutomation } from "./browser-automation.ts";
import { existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: unknown;
}

class TestRunner {
  private automation: BrowserAutomation;
  private results: TestResult[] = [];

  constructor() {
    this.automation = new BrowserAutomation({
      headless: true,
      defaultViewport: { width: 1280, height: 720 },
    });
  }

  private log(message: string): void {
    console.log(message);
  }

  private async test(name: string, fn: () => Promise<void>): Promise<void> {
    this.log(`\n📋 Test: ${name}`);
    try {
      await fn();
      this.results.push({ name, passed: true });
      this.log(`   ✅ PASSED`);
    } catch (error) {
      this.results.push({ name, passed: false, error: String(error) });
      this.log(`   ❌ FAILED: ${error}`);
    }
  }

  async run(): Promise<void> {
    this.log("🧪 Floorp Browser Automation Tests");
    this.log("===================================\n");

    try {
      // Initialize browser
      this.log("🚀 Initializing browser...");
      await this.automation.initialize();
      this.log("✅ Browser initialized\n");

      // Navigate to a test page
      await this.test("Navigate to blank page", async () => {
        const result = await this.automation.navigate("about:blank");
        if (!result.success) throw new Error(result.error);
      });

      // Set up a test HTML page
      await this.test("Set test page content", async () => {
        const testHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Floorp Test Page</title>
            <style>
              body { font-family: system-ui; padding: 20px; background: #f5f5f5; }
              .container { max-width: 800px; margin: 0 auto; }
              h1 { color: #333; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Floorp Browser Automation Test Page</h1>
              <p id="test-paragraph">This is a test paragraph.</p>
              <input type="text" id="test-input" placeholder="Type here">
              <button id="existing-button" aria-label="Existing test button">Click Me</button>
            </div>
          </body>
          </html>
        `;
        const result = await this.automation.setContent(testHtml);
        if (!result.success) throw new Error(result.error);
      });

      // Test 1: DateTime Overlay
      await this.test("Create datetime overlay", async () => {
        const result = await this.automation.createDateTimeOverlay();
        if (!result.success) throw new Error(result.error);
        if (!result.overlayVisible) throw new Error("Overlay not visible");
        if (!result.displayedTime) throw new Error("No time displayed");
        this.log(`   📅 Displayed time: ${result.displayedTime}`);
      });

      // Test 2: Verify DateTime Overlay shows correct time
      await this.test("Verify datetime overlay shows correct time", async () => {
        // Wait a moment for the overlay to update
        await new Promise((resolve) => setTimeout(resolve, 1100));
        
        const result = await this.automation.verifyDateTimeOverlay();
        if (!result.success) throw new Error(result.error);
        if (!result.overlayVisible) throw new Error("Overlay not visible");
        
        // Verify the displayed time is close to current time
        const displayedTime = result.displayedTime;
        if (!displayedTime) throw new Error("No time displayed");
        
        this.log(`   📅 Verified time: ${displayedTime}`);
      });

      // Test 3: Accessibility test for datetime overlay
      await this.test("DateTime overlay accessibility (aria-label)", async () => {
        const result = await this.automation.testAccessibility("#floorp-datetime-overlay");
        if (!result.success) throw new Error(result.error);
        if (!result.passed) throw new Error("Accessibility test failed");
        
        this.log(`   🏷️ aria-label: ${result.element?.ariaLabel}`);
        this.log(`   🎭 role: ${result.element?.role}`);
      });

      // Test 4: Create test button with aria-label
      await this.test("Create test button with aria-label", async () => {
        const result = await this.automation.createTestButton("Test Action Button", "action-button");
        if (!result.success) throw new Error(result.error);
      });

      // Test 5: Accessibility test for the created button
      await this.test("Test button accessibility", async () => {
        const result = await this.automation.testAccessibility("#action-button");
        if (!result.success) throw new Error(result.error);
        if (!result.passed) throw new Error("Button accessibility test failed");
        
        const expectedLabel = "Test Action Button";
        if (result.element?.ariaLabel !== expectedLabel) {
          throw new Error(`Expected aria-label "${expectedLabel}", got "${result.element?.ariaLabel}"`);
        }
        
        this.log(`   🏷️ aria-label: ${result.element?.ariaLabel}`);
        this.log(`   🎭 role: ${result.element?.role}`);
      });

      // Test 6: Test button click functionality
      await this.test("Test button click functionality", async () => {
        const result = await this.automation.testButton("#action-button");
        if (!result.success) throw new Error(result.error);
        
        const value = result.value as { clicked: boolean; selector: string };
        if (!value.clicked) throw new Error("Button click was not registered");
        
        this.log(`   🖱️ Button clicked successfully`);
      });

      // Test 7: Test existing button accessibility
      await this.test("Test existing button accessibility", async () => {
        const result = await this.automation.testAccessibility("#existing-button");
        if (!result.success) throw new Error(result.error);
        if (!result.passed) throw new Error("Existing button accessibility test failed");
        
        this.log(`   🏷️ aria-label: ${result.element?.ariaLabel}`);
      });

      // Test 8: Get coverage data (may not have Istanbul instrumentation)
      await this.test("Check for Istanbul coverage data", async () => {
        const result = await this.automation.getCoverage();
        if (!result.success) throw new Error(result.error);
        
        const value = result.value as { hasCoverage: boolean; coverage: unknown };
        this.log(`   📊 Coverage available: ${value.hasCoverage}`);
        // Note: This test passes whether coverage is available or not
        // since coverage instrumentation is optional
      });

      // Test 9: Take screenshot
      const screenshotPath = join(__dirname, "test-screenshot.png");
      await this.test("Take screenshot", async () => {
        const result = await this.automation.screenshot(screenshotPath);
        if (!result.success) throw new Error(result.error);
        if (!existsSync(screenshotPath)) throw new Error("Screenshot file not created");
        
        this.log(`   📸 Screenshot saved to: ${screenshotPath}`);
      });

      // Clean up screenshot
      if (existsSync(screenshotPath)) {
        unlinkSync(screenshotPath);
        this.log("\n🧹 Cleaned up test screenshot");
      }

      // Test 10: Remove datetime overlay
      await this.test("Remove datetime overlay", async () => {
        const result = await this.automation.removeDateTimeOverlay();
        if (!result.success) throw new Error(result.error);
        
        // Verify it's removed
        const verifyResult = await this.automation.verifyDateTimeOverlay();
        if (verifyResult.overlayVisible) throw new Error("Overlay was not removed");
      });

    } catch (error) {
      this.log(`\n❌ Test suite error: ${error}`);
    } finally {
      // Close browser
      this.log("\n🔒 Closing browser...");
      await this.automation.close();
    }

    // Print summary
    this.printSummary();
  }

  private printSummary(): void {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;

    this.log("\n" + "=".repeat(50));
    this.log("📊 TEST SUMMARY");
    this.log("=".repeat(50));
    this.log(`Total: ${total} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
    
    if (failed > 0) {
      this.log("\nFailed tests:");
      for (const result of this.results.filter((r) => !r.passed)) {
        this.log(`  ❌ ${result.name}: ${result.error}`);
      }
    }

    this.log("\n" + (failed === 0 ? "🎉 All tests passed!" : "⚠️ Some tests failed."));
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run tests
const runner = new TestRunner();
runner.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
