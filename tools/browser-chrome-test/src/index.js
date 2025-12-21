/**
 * Browser-chrome context testing helpers for Floorp.
 *
 * This module provides tools for testing browser UI (chrome context)
 * using the Marionette protocol.
 *
 * Usage:
 *   import { createHelper } from '@floorp/browser-chrome-test';
 *
 *   const helper = createHelper();
 *   await helper.connect(); // or helper.launch({ executablePath: '...' });
 *   await helper.switchToChromeContext();
 *   // Now you can test browser UI
 *
 * For maintainers:
 * - Run `npm run download-binary` to get the Floorp dev build
 * - Run `npm test` to run the example tests
 */

export { BrowserChromeHelper, createHelper } from './browser-chrome-helper.js';
