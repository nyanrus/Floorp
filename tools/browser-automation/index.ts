/**
 * Floorp Browser Automation exports (cleaned)
 * SPDX-License-Identifier: MPL-2.0
 */

export { BrowserAutomation } from "./browser-automation.ts";
export type {
  BrowserAutomationOptions,
  EvaluateResult,
  ScreenshotResult,
  ChromeScreenshotOptions,
} from "./browser-automation.ts";

export { setupFloorp, findFloorpBinary, getFloorpDir } from "./setup-floorp.ts";
