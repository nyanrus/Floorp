# Floorp Browser Automation Tool

A Node.js tool for automating Floorp browser for testing using the Marionette protocol via [foxr](https://github.com/f3liz-dev/foxr/).

## Features

- **Automatic Binary Setup**: Downloads and sets up Floorp dev binary automatically
- **Interactive Shell**: CLI interface for LLM to control the browser
- **DateTime Overlay**: Create and test datetime overlay in the top-right corner
- **Accessibility Testing**: Verify aria-label and role attributes
- **Button Testing**: Create and test button interactions
- **Screenshots**: Capture page screenshots
- **Istanbul Coverage**: Retrieve code coverage data when available

## Installation

The tool is part of the Floorp repository. Dependencies are managed via pnpm:

```bash
pnpm install
```

## Usage

### Interactive Shell

Run the interactive shell for manual testing:

```bash
npx ts-node tools/browser-automation/shell.ts

# Or run with visible browser window:
npx ts-node tools/browser-automation/shell.ts --headed
```

Available commands:
- `navigate <url>` - Navigate to a URL
- `datetime` - Create datetime overlay
- `verify-datetime` - Verify datetime overlay
- `button <label>` - Create a test button
- `test-button <selector>` - Test button click
- `accessibility <selector>` - Test accessibility
- `screenshot [path]` - Take a screenshot
- `help` - Show all commands

### Run Automated Tests

```bash
npx ts-node tools/browser-automation/run-tests.ts
```

### Programmatic API

```typescript
import { BrowserAutomation } from "./tools/browser-automation";

async function main() {
  const automation = new BrowserAutomation({
    headless: true,
    defaultViewport: { width: 1280, height: 720 },
  });

  await automation.initialize();

  // Navigate to a page
  await automation.navigate("https://example.com");

  // Create datetime overlay
  const dtResult = await automation.createDateTimeOverlay();
  console.log("DateTime:", dtResult.displayedTime);

  // Create and test a button
  await automation.createTestButton("Click Me", "my-button");
  const a11yResult = await automation.testAccessibility("#my-button");
  console.log("Accessibility passed:", a11yResult.passed);

  // Take a screenshot
  await automation.screenshot("screenshot.png");

  // Close browser
  await automation.close();
}

main();
```

## API Reference

### BrowserAutomation

Main class for browser automation.

#### Constructor

```typescript
new BrowserAutomation(options?: BrowserAutomationOptions)
```

Options:
- `headless?: boolean` - Run browser in headless mode (default: true)
- `executablePath?: string` - Path to browser executable (auto-detected if not provided)
- `defaultViewport?: { width: number, height: number }` - Viewport size

#### Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize browser and download binary if needed |
| `navigate(url)` | Navigate to a URL |
| `getUrl()` | Get current page URL |
| `getTitle()` | Get page title |
| `getContent()` | Get page HTML content |
| `setContent(html)` | Set page HTML content |
| `evaluate(script)` | Evaluate JavaScript in page context |
| `findElement(selector)` | Find element by CSS selector |
| `click(selector)` | Click an element |
| `type(selector, text)` | Type text into an element |
| `screenshot(path?)` | Take a screenshot |
| `createDateTimeOverlay()` | Create datetime overlay |
| `verifyDateTimeOverlay()` | Verify datetime overlay |
| `createTestButton(label, id?)` | Create a test button |
| `testButton(selector)` | Test button click functionality |
| `testAccessibility(selector)` | Test accessibility of an element |
| `getCoverage()` | Get Istanbul coverage data |
| `close()` | Close the browser |

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Linux x86_64 (for automatic binary download)

### Running Tests

```bash
# Run automated test suite
npx ts-node tools/browser-automation/run-tests.ts
```

## License

MPL-2.0
