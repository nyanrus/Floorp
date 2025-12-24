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
import {
  executeGestureAction,
  getActionDisplayName,
} from "./utils/gestures.ts";
import {
  createGestureRecognizer,
  recognizeGesture,
} from "./utils/recognizer.ts";

export class MouseGestureController {
  private isGestureActive = false;
  private isContextMenuPrevented = false;
  private preventionTimeoutId: number | null = null;
  private gesturePattern: GestureDirection[] = [];
  private mouseTrail: { x: number; y: number }[] = [];
  private display: GestureDisplay;
  private activeActionName = "";
  private eventListenersAttached = false;
  private pressedButtons = new Set<number>();
  private isRockerGestureFired = false;
  private targetWindow: Window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognizer: any = null;
  private lastConfigHash = "";

  constructor(win: Window = globalThis as unknown as Window) {
    this.targetWindow = win;
    this.display = new GestureDisplay(win);
    this.init();
  }

  private getActivationDistance(config: ReturnType<typeof getConfig>): number {
    const baseDistance = config.contextMenu?.minDistance ?? 10;
    const sensitivity = Number.isFinite(config.sensitivity)
      ? config.sensitivity
      : 40;
    const sensitivityFactor = Math.min(Math.max(sensitivity, 1), 100) / 100;
    const dynamicDistance = 6 + (1 - sensitivityFactor) * 12;
    return Math.max(baseDistance, dynamicDistance, 10);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getRecognizer(config: ReturnType<typeof getConfig>): any {
    const configHash = JSON.stringify(config.actions);
    if (!this.recognizer || this.lastConfigHash !== configHash) {
      this.recognizer = createGestureRecognizer(config.actions);
      this.lastConfigHash = configHash;
    }
    return this.recognizer;
  }

  private getMinScore(config: ReturnType<typeof getConfig>): number {
    const sensitivity = Number.isFinite(config.sensitivity)
      ? config.sensitivity
      : 40;
    const sensitivityFactor = Math.min(Math.max(sensitivity, 1), 100) / 100;
    // Higher sensitivity = lower required score (easier to match)
    return Math.max(0.5, 0.85 - sensitivityFactor * 0.3);
  }

  private init(): void {
    if (this.eventListenersAttached) return;

    this.targetWindow.addEventListener("mousedown", this.handleMouseDown);
    this.targetWindow.addEventListener("mousemove", this.handleMouseMove);
    this.targetWindow.addEventListener("mouseup", this.handleMouseUp);
    this.targetWindow.addEventListener(
      "contextmenu",
      this.handleContextMenu,
      true,
    );
    this.eventListenersAttached = true;
  }

  public destroy(): void {
    if (this.eventListenersAttached) {
      this.targetWindow.removeEventListener("mousedown", this.handleMouseDown);
      this.targetWindow.removeEventListener("mousemove", this.handleMouseMove);
      this.targetWindow.removeEventListener("mouseup", this.handleMouseUp);
      this.targetWindow.removeEventListener(
        "contextmenu",
        this.handleContextMenu,
        true,
      );
      this.eventListenersAttached = false;
    }

    if (this.preventionTimeoutId !== null) {
      clearTimeout(this.preventionTimeoutId);
      this.preventionTimeoutId = null;
    }

    this.resetGestureState();
    this.display.destroy();
  }

  private getAdjustedClientCoords(event: MouseEvent): { x: number; y: number } {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  private handleMouseDown = (event: MouseEvent): void => {
    if (!isEnabled()) {
      return;
    }

    this.pressedButtons.add(event.button);
    const config = getConfig();

    // Rocker Gestures
    if (config.rockerGesturesEnabled) {
      const [LEFT, RIGHT] = [0, 2];
      let action: string | null = null;

      // Right -> Left
      if (this.isGestureActive && event.button === LEFT) {
        action = "gecko-back";
      }
      // Left -> Right
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

    if (event.button !== 2 || this.isGestureActive) {
      return;
    }

    this.isContextMenuPrevented = true;
    if (this.preventionTimeoutId !== null) {
      clearTimeout(this.preventionTimeoutId);
      this.preventionTimeoutId = null;
    }

    this.isGestureActive = true;
    this.gesturePattern = [];

    const coords = this.getAdjustedClientCoords(event);
    this.mouseTrail = [coords];
    this.activeActionName = "";

    this.display.show();
    this.display.updateTrail(this.mouseTrail);
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.isGestureActive || !isEnabled()) {
      return;
    }

    const config = getConfig();
    const coords = this.getAdjustedClientCoords(event);
    this.mouseTrail.push(coords);

    // Run pattern matching every few points for performance
    if (this.mouseTrail.length % 3 === 0 || this.mouseTrail.length > 20) {
      const result = this.tryRecognize(config);
      if (result) {
        this.gesturePattern = result.pattern;
        this.activeActionName = result.actionName;
      } else {
        this.activeActionName = "";
      }
    }

    this.display.updateTrail(this.mouseTrail);
    this.display.updateActionName(this.activeActionName);
  };

  private handleMouseUp = (event: MouseEvent): void => {
    this.pressedButtons.delete(event.button);

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
    const activationDistance = this.getActivationDistance(config);

    // Final pattern recognition
    const result = this.tryRecognize(config);

    if (result) {
      this.gesturePattern = result.pattern;
      this.activeActionName = result.actionName;
      this.display.updateActionName(this.activeActionName);
      setTimeout(() => {
        executeGestureAction(result.action);
        this.resetGestureState();
        this.preventionTimeoutId = setTimeout(() => {
          this.isContextMenuPrevented = false;
          this.preventionTimeoutId = null;
        }, preventionTimeout);
      }, 100);

      return;
    }

    // If no gesture recognized, check minimum movement distance
    const totalMovement = this.getTotalMovement();
    const minMovement = Math.max(activationDistance * 0.85, 10);

    if (totalMovement < minMovement) {
      this.isContextMenuPrevented = false;
      this.resetGestureState();
      return;
    }

    this.preventionTimeoutId = setTimeout(() => {
      this.isContextMenuPrevented = false;
      this.preventionTimeoutId = null;
    }, preventionTimeout);

    this.resetGestureState();
  };

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
    this.gesturePattern = [];
    this.mouseTrail = [];
    this.activeActionName = "";
    this.display.hide();
    this.pressedButtons.clear();
  }

  private handleContextMenu = (event: MouseEvent): void => {
    if ((this.isGestureActive || this.isContextMenuPrevented) && isEnabled()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  /**
   * Try to recognize the current gesture using the $1 Unistroke Recognizer.
   * Returns the matched pattern, action name, and action ID if successful.
   */
  private tryRecognize(
    config: ReturnType<typeof getConfig>,
  ): { pattern: GestureDirection[]; actionName: string; action: string } | null {
    if (this.mouseTrail.length < 2) {
      return null;
    }

    // Check minimum movement distance
    const totalMovement = this.getTotalMovement();
    const minDistance = this.getActivationDistance(config);
    if (totalMovement < minDistance) {
      return null;
    }

    // Use the $1 Recognizer
    const recognizer = this.getRecognizer(config);
    const minScore = this.getMinScore(config);
    const result = recognizeGesture(recognizer, this.mouseTrail, minScore);

    if (!result) {
      return null;
    }

    // Convert pattern string to directions and find the matching action
    const pattern = stringToPattern(result.pattern);
    const matchingAction = config.actions.find(
      (a) => patternToString(a.pattern) === result.pattern,
    );

    if (!matchingAction) {
      return null;
    }

    return {
      pattern,
      actionName: getActionDisplayName(matchingAction.action),
      action: matchingAction.action,
    };
  }
}
