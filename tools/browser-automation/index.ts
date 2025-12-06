/**
 * Floorp Browser Automation Tool
 * 
 * This module provides browser automation capabilities for testing Floorp
 * using the Marionette protocol via foxr.
 * 
 * Features:
 * - Download and setup Floorp dev binary automatically
 * - Interactive shell for LLM to control browser
 * - DateTime overlay creation and testing
 * - Accessibility testing with aria-label verification
 * - Button interaction testing
 * - Screenshot capture (content and chrome context)
 * - Chrome context (browser UI) manipulation
 * - Istanbul coverage data retrieval
 * 
 * SPDX-License-Identifier: MPL-2.0
 */

export { BrowserAutomation } from "./browser-automation.ts";
export type {
  BrowserAutomationOptions,
  EvaluateResult,
  ScreenshotResult,
  ChromeScreenshotOptions,
  AccessibilityTestResult,
  DateTimeOverlayResult,
} from "./browser-automation.ts";

export { setupFloorp, findFloorpBinary, getFloorpDir } from "./setup-floorp.ts";
