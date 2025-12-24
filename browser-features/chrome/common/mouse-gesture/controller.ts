/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  type GestureDirection,
  getConfig,
  isEnabled,
  patternToString,
  stringToPattern,
} from "./config.ts";
import { GestureDisplay } from "./components/GestureDisplay.tsx";
import { executeGestureAction, getActionDisplayName } from "./utils/gestures.ts";
import { createRecognizer, recognize } from "./utils/recognizer.ts";
import type { IDollarRecognizer } from "./utils/dollar.ts";

/**
 * MouseGestureController handles mouse gesture recognition.
 *
 * This controller uses the $1 Unistroke Recognizer algorithm:
 * - Collects mouse trail points during right-click drag
 * - Performs real-time recognition during drag for instant feedback
 * - Executes the action when the gesture is complete (on mouse up)
 */
export class MouseGestureController {
  private isGestureActive = false;
  private isContextMenuPrevented = false;
  private preventionTimeoutId: number | null = null;
  private mouseTrail: { x: number; y: number }[] = [];
  private display: GestureDisplay;
  private eventListenersAttached = false;
  private pressedButtons = new Set<number>();
  private isRockerGestureFired = false;
  private targetWindow: Window;
  private recognizer: IDollarRecognizer | null = null;
  private lastConfigHash = "";

  constructor(win: Window = globalThis as unknown as Window) {
    this.targetWindow = win;
    this.display = new GestureDisplay(win);
    this.init();
  }

  private init(): void {
    if (this.eventListenersAttached) return;

    this.targetWindow.addEventListener("mousedown", this.handleMouseDown);
    this.targetWindow.addEventListener("mousemove", this.handleMouseMove);
    this.targetWindow.addEventListener("mouseup", this.handleMouseUp);
    this.targetWindow.addEventListener("contextmenu", this.handleContextMenu, true);
    this.eventListenersAttached = true;
  }

  public destroy(): void {
    if (this.eventListenersAttached) {
      this.targetWindow.removeEventListener("mousedown", this.handleMouseDown);
      this.targetWindow.removeEventListener("mousemove", this.handleMouseMove);
      this.targetWindow.removeEventListener("mouseup", this.handleMouseUp);
      this.targetWindow.removeEventListener("contextmenu", this.handleContextMenu, true);
      this.eventListenersAttached = false;
    }

    if (this.preventionTimeoutId !== null) {
      clearTimeout(this.preventionTimeoutId);
      this.preventionTimeoutId = null;
    }

    this.resetGestureState();
    this.display.destroy();
  }

  /**
   * Get or create the $1 Recognizer, rebuilding if config changed.
   */
  private getRecognizer(): IDollarRecognizer {
    const config = getConfig();
    const configHash = JSON.stringify(config.actions);

    if (!this.recognizer || this.lastConfigHash !== configHash) {
      this.recognizer = createRecognizer(config.actions);
      this.lastConfigHash = configHash;
    }

    return this.recognizer;
  }

  /**
   * Calculate minimum score threshold based on sensitivity setting.
   */
  private getMinScore(): number {
    const config = getConfig();
    const sensitivity = Number.isFinite(config.sensitivity) ? config.sensitivity : 40;
    const sensitivityFactor = Math.min(Math.max(sensitivity, 1), 100) / 100;
    // Higher sensitivity = lower required score (easier to match)
    return Math.max(0.5, 0.85 - sensitivityFactor * 0.3);
  }

  /**
   * Calculate the minimum movement distance to trigger recognition.
   */
  private getActivationDistance(): number {
    const config = getConfig();
    const baseDistance = config.contextMenu?.minDistance ?? 10;
    const sensitivity = Number.isFinite(config.sensitivity) ? config.sensitivity : 40;
    const sensitivityFactor = Math.min(Math.max(sensitivity, 1), 100) / 100;
    const dynamicDistance = 6 + (1 - sensitivityFactor) * 12;
    return Math.max(baseDistance, dynamicDistance, 10);
  }

  /**
   * Calculate total movement distance from start to end of trail.
   */
  private getTotalMovement(): number {
    if (this.mouseTrail.length < 2) return 0;

    const startPoint = this.mouseTrail[0];
    const lastPoint = this.mouseTrail[this.mouseTrail.length - 1];

    const dx = lastPoint.x - startPoint.x;
    const dy = lastPoint.y - startPoint.y;

    return Math.sqrt(dx * dx + dy * dy);
  }

  private resetGestureState(): void {
    this.isGestureActive = false;
    this.isRockerGestureFired = false;
    this.mouseTrail = [];
    this.display.hide();
    this.pressedButtons.clear();
  }

  private handleMouseDown = (event: MouseEvent): void => {
    if (!isEnabled()) return;

    this.pressedButtons.add(event.button);
    const config = getConfig();

    // Handle rocker gestures (left+right mouse buttons)
    if (config.rockerGesturesEnabled) {
      const LEFT = 0;
      const RIGHT = 2;
      let action: string | null = null;

      // Right button held, then left button pressed -> back
      if (this.isGestureActive && event.button === LEFT) {
        action = "gecko-back";
      }
      // Left button held, then right button pressed -> forward
      else if (this.pressedButtons.has(LEFT) && event.button === RIGHT) {
        action = "gecko-forward";
      }

      if (action) {
        executeGestureAction(action);
        event.preventDefault();
        event.stopPropagation();
        this.isRockerGestureFired = true;
        this.isContextMenuPrevented = true;
        return;
      }
    }

    // Only start gesture on right mouse button
    if (event.button !== 2 || this.isGestureActive) return;

    this.isContextMenuPrevented = true;
    if (this.preventionTimeoutId !== null) {
      clearTimeout(this.preventionTimeoutId);
      this.preventionTimeoutId = null;
    }

    this.isGestureActive = true;
    this.mouseTrail = [{ x: event.clientX, y: event.clientY }];

    this.display.show();
    this.display.updateTrail(this.mouseTrail);
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.isGestureActive || !isEnabled()) return;

    // Collect trail point
    this.mouseTrail.push({ x: event.clientX, y: event.clientY });
    this.display.updateTrail(this.mouseTrail);

    // Perform real-time recognition for instant feedback
    const totalMovement = this.getTotalMovement();
    const activationDistance = this.getActivationDistance();

    if (totalMovement >= activationDistance) {
      const recognizer = this.getRecognizer();
      const minScore = this.getMinScore();
      const result = recognize(recognizer, this.mouseTrail, minScore);

      if (result) {
        const config = getConfig();
        const matchingAction = config.actions.find(
          (a) => patternToString(a.pattern) === result.patternName,
        );
        if (matchingAction) {
          const actionName = getActionDisplayName(matchingAction.action);
          this.display.updateActionName(actionName);
        } else {
          this.display.updateActionName("");
        }
      } else {
        this.display.updateActionName("");
      }
    }
  };

  private handleMouseUp = (event: MouseEvent): void => {
    this.pressedButtons.delete(event.button);

    // Handle rocker gesture cleanup
    if (this.isRockerGestureFired) {
      if (this.pressedButtons.size === 0) {
        this.resetGestureState();
        this.isContextMenuPrevented = true;
        if (this.preventionTimeoutId) clearTimeout(this.preventionTimeoutId);
        this.preventionTimeoutId = setTimeout(() => {
          this.isContextMenuPrevented = false;
          this.preventionTimeoutId = null;
        }, getConfig().contextMenu.preventionTimeout);
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!this.isGestureActive || event.button !== 2 || !isEnabled()) return;

    const config = getConfig();
    const preventionTimeout = config.contextMenu.preventionTimeout;

    // Check if we moved enough to be considered a gesture
    const totalMovement = this.getTotalMovement();
    const activationDistance = this.getActivationDistance();

    if (totalMovement < activationDistance) {
      // Not enough movement - allow context menu
      this.isContextMenuPrevented = false;
      this.resetGestureState();
      return;
    }

    // Use $1 Recognizer to identify the gesture
    const recognizer = this.getRecognizer();
    const minScore = this.getMinScore();
    const result = recognize(recognizer, this.mouseTrail, minScore);

    if (result) {
      // Find the matching action from config
      const pattern = stringToPattern(result.patternName);
      const matchingAction = config.actions.find(
        (a) => patternToString(a.pattern) === result.patternName,
      );

      if (matchingAction) {
        const actionName = getActionDisplayName(matchingAction.action);
        this.display.updateActionName(actionName);

        // Execute the action after a brief display delay
        setTimeout(() => {
          executeGestureAction(matchingAction.action);
          this.resetGestureState();
          this.preventionTimeoutId = setTimeout(() => {
            this.isContextMenuPrevented = false;
            this.preventionTimeoutId = null;
          }, preventionTimeout);
        }, 100);

        return;
      }
    }

    // No gesture recognized - prevent context menu and reset
    this.preventionTimeoutId = setTimeout(() => {
      this.isContextMenuPrevented = false;
      this.preventionTimeoutId = null;
    }, preventionTimeout);

    this.resetGestureState();
  };

  private handleContextMenu = (event: MouseEvent): void => {
    if ((this.isGestureActive || this.isContextMenuPrevented) && isEnabled()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}
