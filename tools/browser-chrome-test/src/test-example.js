#!/usr/bin/env node
/**
 * Example tests for browser-chrome context testing.
 *
 * This file demonstrates how to use the BrowserChromeHelper to:
 * 1. Create a datetime overlay in the top-right corner
 * 2. Add a button with aria-label and test it works
 * 3. Take a screenshot
 * 4. Run accessibility tests
 *
 * Maintainers: This is a simple example. Expand as needed.
 * The real tests should be written by maintainers based on requirements.
 */

import { createHelper } from './browser-chrome-helper.js';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Simple test runner helper.
 */
function test(name, fn) {
  return async () => {
    console.log(`\n--- Test: ${name} ---`);
    try {
      await fn();
      testResults.passed++;
      testResults.tests.push({ name, status: 'passed' });
      console.log(`✓ PASSED: ${name}`);
    } catch (error) {
      testResults.failed++;
      testResults.tests.push({ name, status: 'failed', error: error.message });
      console.error(`✗ FAILED: ${name}`);
      console.error(`  Error: ${error.message}`);
    }
  };
}

/**
 * Find the Floorp executable in the bin directory.
 */
function findExecutable() {
  const binDir = join(PROJECT_ROOT, 'bin');

  const candidates = [
    join(binDir, 'floorp', 'floorp-bin'),
    join(binDir, 'floorp', 'floorp'),
    join(binDir, 'floorp-bin'),
    join(binDir, 'floorp')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function main() {
  console.log('=== Browser-Chrome Context Test Examples ===\n');

  // Find executable
  const executablePath = findExecutable();
  if (!executablePath) {
    console.log('No Floorp binary found in bin directory.');
    console.log('Run `npm run download-binary` first, or provide a path manually.');
    console.log('\nSkipping tests that require a running browser.\n');
    console.log('The following tests would run with a browser:');
    console.log('  1. Create datetime overlay in top-right corner');
    console.log('  2. Add button with aria-label and test click');
    console.log('  3. Check accessibility attributes');
    console.log('  4. Take screenshot');
    return;
  }

  console.log(`Using executable: ${executablePath}\n`);

  const helper = createHelper();

  try {
    // Launch the browser
    console.log('Launching browser...');
    console.log('Note: If running in a container/CI, you may need to disable the sandbox.');
    console.log('      Add MOZ_ENABLE_WAYLAND=0 and MOZ_DISABLE_GMP_SANDBOX=1 to environment.\n');
    await helper.launch({
      executablePath,
      headless: true, // Use headless for CI environments
      args: [
        '--no-remote',
        '--disable-gpu',
        // These help in containerized environments
      ]
    });

    // Define tests
    const tests = [
      test('Switch to chrome context', async () => {
        await helper.switchToChromeContext();
      }),

      test('Create datetime overlay in top-right corner', async () => {
        const datetime = await helper.getCurrentDatetime();
        console.log(`  Current datetime: ${datetime}`);

        // Create the overlay HTML
        const overlayHTML = `
          <div id="test-datetime-overlay" style="
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
            z-index: 99999;
            pointer-events: none;
          ">${datetime}</div>
        `;

        // Insert into the browser chrome document
        await helper.insertChromeHTML('#main-window', overlayHTML);

        // Verify it exists
        const overlay = await helper.queryChromeSelector('#test-datetime-overlay');
        if (!overlay) {
          throw new Error('Overlay was not created');
        }
        console.log(`  Overlay created: ${overlay.textContent}`);

        // Check if datetime is reasonable (contains a date-like pattern)
        if (!overlay.textContent.match(/\d/)) {
          throw new Error('Overlay does not contain date/time information');
        }
      }),

      test('Add button with aria-label and test click', async () => {
        let clickCount = 0;

        // Create a test button with proper aria-label
        const buttonHTML = `
          <button id="test-aria-button"
                  aria-label="Test action button"
                  style="
                    position: fixed;
                    top: 50px;
                    right: 10px;
                    background: #0060df;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    z-index: 99999;
                  ">Click Me</button>
        `;

        await helper.insertChromeHTML('#main-window', buttonHTML);

        // Add click handler that updates a data attribute
        await helper.executeScript(`
          const btn = document.querySelector('#test-aria-button');
          btn.dataset.clicked = '0';
          btn.addEventListener('click', () => {
            btn.dataset.clicked = String(parseInt(btn.dataset.clicked) + 1);
          });
        `);

        // Click the button
        await helper.clickChromeElement('#test-aria-button');

        // Verify click was registered
        const result = await helper.executeScript(`
          const btn = document.querySelector('#test-aria-button');
          return { clicked: btn.dataset.clicked };
        `);

        if (result.clicked !== '1') {
          throw new Error(`Expected 1 click, got ${result.clicked}`);
        }
        console.log('  Button click registered successfully');
      }),

      test('Check accessibility of button', async () => {
        const a11y = await helper.checkAccessibility('#test-aria-button');

        console.log('  Accessibility info:', JSON.stringify(a11y, null, 2));

        if (!a11y.ariaLabel) {
          throw new Error('Button missing aria-label');
        }
        if (a11y.ariaLabel !== 'Test action button') {
          throw new Error(`Wrong aria-label: ${a11y.ariaLabel}`);
        }
        if (!a11y.hasAccessibleName) {
          throw new Error('Button has no accessible name');
        }
        if (!a11y.isInteractive) {
          throw new Error('Button is not marked as interactive');
        }
        console.log('  Accessibility check passed');
      }),

      test('Take screenshot', async () => {
        const screenshotPath = join(PROJECT_ROOT, 'screenshots', 'test-screenshot.png');
        const buffer = await helper.screenshot({ path: screenshotPath });

        if (!buffer || buffer.length === 0) {
          throw new Error('Screenshot buffer is empty');
        }
        console.log(`  Screenshot size: ${buffer.length} bytes`);
        console.log(`  Saved to: ${screenshotPath}`);
      }),

      test('Clean up test elements', async () => {
        const overlayRemoved = await helper.removeChromeElement('#test-datetime-overlay');
        const buttonRemoved = await helper.removeChromeElement('#test-aria-button');

        console.log(`  Overlay removed: ${overlayRemoved}`);
        console.log(`  Button removed: ${buttonRemoved}`);
      })
    ];

    // Run all tests
    for (const runTest of tests) {
      await runTest();
    }

  } catch (error) {
    console.error(`\nFatal error: ${error.message}`);

    // Check for common environment issues
    if (error.message.includes('Socket connection timeout') ||
        error.message.includes('ECONNREFUSED')) {
      console.log('\nNote: Browser may have crashed or failed to start.');
      console.log('Common causes:');
      console.log('  1. Missing display server (run with Xvfb for headless)');
      console.log('  2. Sandbox restrictions in containers');
      console.log('  3. Missing dependencies');
      console.log('\nTry running with:');
      console.log('  MOZ_DISABLE_GMP_SANDBOX=1 xvfb-run npm test');
    }

    console.error(error.stack);
  } finally {
    // Clean up
    console.log('\nClosing browser...');
    await helper.close(true).catch(() => {});
  }

  // Print summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);

  if (testResults.failed > 0) {
    console.log('\nFailed tests:');
    testResults.tests
      .filter(t => t.status === 'failed')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
    process.exit(1);
  }
}

main().catch(console.error);
