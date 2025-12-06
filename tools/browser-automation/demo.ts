/**
 * Demo script to showcase browser automation features
 * 
 * SPDX-License-Identifier: MPL-2.0
 */

import { BrowserAutomation } from "./browser-automation.ts";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log("🌐 Floorp Browser Automation Demo");
  console.log("===================================\n");

  const automation = new BrowserAutomation({
    headless: true,
    defaultViewport: { width: 1280, height: 720 },
  });

  try {
    await automation.initialize();
    
    // Navigate to blank page and set content
    await automation.navigate("about:blank");
    await automation.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Floorp Browser Automation Demo</title>
        <style>
          body { 
            font-family: system-ui, -apple-system, sans-serif; 
            padding: 40px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            margin: 0;
          }
          .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 { 
            color: #333; 
            margin-bottom: 20px;
          }
          p {
            color: #666;
            line-height: 1.6;
          }
          .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 30px;
          }
          .feature {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
          }
          .feature-icon {
            font-size: 40px;
            margin-bottom: 10px;
          }
          .feature h3 {
            margin: 10px 0;
            color: #333;
          }
          .feature p {
            margin: 0;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🦊 Floorp Browser Automation</h1>
          <p>This demo page showcases the browser automation capabilities powered by foxr and Marionette protocol.</p>
          
          <div class="features">
            <div class="feature">
              <div class="feature-icon">📸</div>
              <h3>Screenshots</h3>
              <p>Full window & element captures</p>
            </div>
            <div class="feature">
              <div class="feature-icon">🔧</div>
              <h3>Chrome Context</h3>
              <p>Access browser UI elements</p>
            </div>
            <div class="feature">
              <div class="feature-icon">♿</div>
              <h3>Accessibility</h3>
              <p>ARIA label verification</p>
            </div>
            <div class="feature">
              <div class="feature-icon">⏰</div>
              <h3>DateTime Overlay</h3>
              <p>Dynamic overlay testing</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);

    // Create datetime overlay
    console.log("📅 Creating datetime overlay...");
    const dtResult = await automation.createDateTimeOverlay();
    console.log(`   Time: ${dtResult.displayedTime}\n`);

    // Create test button
    console.log("🔘 Creating test button...");
    await automation.createTestButton("Click Me!", "demo-button");

    // Take full window screenshot
    const screenshotPath = join(__dirname, "demo-screenshot.png");
    console.log("📸 Taking full window screenshot...");
    const ssResult = await automation.screenshotFullWindow(screenshotPath);
    console.log(`   Saved to: ${screenshotPath}\n`);

    // Test accessibility
    console.log("♿ Testing accessibility...");
    const a11yResult = await automation.testAccessibility("#demo-button");
    if (a11yResult.success && a11yResult.passed) {
      console.log(`   ✅ Button has aria-label: ${a11yResult.element?.ariaLabel}\n`);
    }

    // Test button click
    console.log("🖱️ Testing button click...");
    const clickResult = await automation.testButton("#demo-button");
    if (clickResult.success) {
      const clicked = (clickResult.value as { clicked: boolean }).clicked;
      console.log(`   ${clicked ? "✅ Button clicked successfully" : "❌ Button click failed"}\n`);
    }

    console.log("✅ Demo completed successfully!");
    console.log(`\n📸 Screenshot saved to: ${screenshotPath}`);

  } catch (error) {
    console.error("❌ Demo failed:", error);
  } finally {
    await automation.close();
  }
}

main().catch(console.error);
