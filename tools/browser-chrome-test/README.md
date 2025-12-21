# Browser-Chrome Testing Helpers for Floorp

Testing helpers for browser UI (chrome context) using the Marionette protocol via [foxr](https://jsr.io/@f3liz/foxr).

## Overview

This module provides tools for testing browser UI elements in Floorp's chrome context. Unlike typical web content testing (via WebDriver), browser-chrome testing allows you to:

- Access browser internals (`gBrowser`, `document`, `Services`, etc.)
- Test browser UI elements (toolbar, sidebar, tabs, etc.)
- Create overlays and test widgets
- Run accessibility checks on browser UI
- Use JS execution through Marionette (most WebDriver methods don't work in chrome context)

## Quick Start

### 1. Download the Dev Binary

```bash
cd tools/browser-chrome-test
npm install
npm run download-binary
```

This downloads the latest Floorp dev build from `dev-assets.floorp.app`.

### 2. Run Example Tests

```bash
npm test
```

For containerized environments (CI), you may need:
```bash
xvfb-run npm test
```

This runs the example tests demonstrating:
- DateTime overlay creation
- Button with aria-label
- Accessibility testing
- Screenshot capture

## Usage

```javascript
import { createHelper } from '@floorp/browser-chrome-test';

const helper = createHelper();

// Option 1: Connect to a running browser
await helper.connect({ host: 'localhost', port: 2828 });

// Option 2: Launch a new browser
await helper.launch({
  executablePath: '/path/to/floorp-bin',
  headless: true
});

// Switch to chrome context for browser UI testing
await helper.switchToChromeContext();

// Execute JS in browser UI
const result = await helper.executeScript(`
  return gBrowser.tabs.length;
`);
console.log('Open tabs:', result);

// Take a screenshot
await helper.screenshot({ path: 'browser.png' });

// Clean up
await helper.close();
```

## API Reference

### `createHelper()`

Creates a new `BrowserChromeHelper` instance.

### `helper.connect(options)`

Connect to a running browser with Marionette enabled.

- `options.host` - Marionette host (default: `'localhost'`)
- `options.port` - Marionette port (default: `2828`)

### `helper.launch(options)`

Launch a new browser instance.

- `options.executablePath` - Path to the browser executable (required)
- `options.headless` - Run in headless mode (default: `false`)
- `options.args` - Additional command line arguments

### `helper.switchToChromeContext()`

Switch to chrome context for browser UI testing.

In chrome context, you have access to:
- `document` - The browser's XUL/HTML document
- `gBrowser` - The global browser object
- `window` - The browser window
- `ChromeUtils`, `Services`, etc.

### `helper.switchToContentContext()`

Switch back to content context (web page).

### `helper.executeScript(script, args)`

Execute JavaScript synchronously in the current context.

```javascript
const tabs = await helper.executeScript(`
  return gBrowser.tabs.length;
`);
```

### `helper.executeAsyncScript(script, args)`

Execute JavaScript asynchronously. The script receives a resolve function.

```javascript
const result = await helper.executeAsyncScript(`
  setTimeout(() => resolve('done'), 1000);
`);
```

### `helper.screenshot(options)`

Take a screenshot of the browser window.

- `options.path` - Path to save the screenshot
- `options.fullPage` - Capture full page (default: `true`)

Returns a `Buffer` containing the PNG image.

### `helper.queryChromeSelector(selector)`

Query for an element in the chrome document.

Returns an object with element info or `null` if not found.

### `helper.checkAccessibility(selector)`

Check accessibility attributes of an element.

Returns:
```javascript
{
  tagName: 'BUTTON',
  role: 'button',
  ariaLabel: 'Close tab',
  hasAccessibleName: true,
  isInteractive: true,
  // ... more attributes
}
```

### `helper.clickChromeElement(selector)`

Click on an element in the chrome document.

### `helper.insertChromeHTML(parentSelector, html, position)`

Insert HTML into the chrome document.

```javascript
await helper.insertChromeHTML('#toolbar', '<div id="my-widget">Hello</div>');
```

### `helper.removeChromeElement(selector)`

Remove an element from the chrome document.

### `helper.close(quitBrowser)`

Close the connection. If `quitBrowser` is `true`, also closes the browser.

## Important Notes for Maintainers

1. **Chrome Context vs Content Context**: Most WebDriver methods only work in content context. For browser UI testing, use `executeScript` after switching to chrome context.

2. **Marionette Protocol**: This uses Marionette, not CDP or WebDriver. Some methods behave differently.

3. **Element References**: You cannot get persistent element references in chrome context. Use selectors for each operation.

4. **Security**: Chrome context has full access to browser internals. Be careful with test cleanup.

5. **Headless Mode**: Some UI tests may not work correctly in headless mode.

## Extending the Helper

To add new methods, edit `src/browser-chrome-helper.js`. Follow the existing patterns:

1. Switch to chrome context if needed
2. Use `executeScript` for DOM operations
3. Return serializable results
4. Handle errors gracefully

## Code Coverage with Istanbul

To get code coverage, the repository uses `vite-plugin-istanbul`. For browser-chrome context tests:

1. Build the browser features with coverage instrumentation (handled by vite config)
2. Run tests through this helper module
3. Collect coverage data from `window.__coverage__` in chrome context:

```javascript
// After running tests
const coverage = await helper.executeScript('return window.__coverage__');
// Write coverage to file for istanbul report
```

Note: Coverage for browser-chrome context may require additional setup in the build configuration.

## Troubleshooting

### "Connection refused"

The browser must be started with Marionette enabled:
```bash
floorp -marionette
```

### "Element not found"

The selector may not exist in chrome context. Use browser devtools in chrome context (`Ctrl+Shift+Alt+I`) to inspect elements.

### "Permission denied"

Some operations require specific permissions. Check if you're in the correct context.
