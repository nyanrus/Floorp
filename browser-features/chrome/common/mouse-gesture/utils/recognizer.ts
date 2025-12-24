/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Mouse gesture recognizer using the $1 Unistroke Recognizer algorithm.
 * This provides a simple interface for recognizing directional gestures.
 */

import {
  DollarRecognizer,
  Point,
  type DollarPoint,
  type IDollarRecognizer,
} from "./dollar.ts";
import type { GestureDirection, GestureAction } from "../config.ts";

// Direction vectors for generating gesture templates
const DIRECTION_VECTORS: Record<GestureDirection, { dx: number; dy: number }> =
  {
    right: { dx: 1, dy: 0 },
    downRight: { dx: 0.707, dy: 0.707 },
    down: { dx: 0, dy: 1 },
    downLeft: { dx: -0.707, dy: 0.707 },
    left: { dx: -1, dy: 0 },
    upLeft: { dx: -0.707, dy: -0.707 },
    up: { dx: 0, dy: -1 },
    upRight: { dx: 0.707, dy: -0.707 },
  };

// Create a point using the Point constructor
function createPoint(x: number, y: number): DollarPoint {
  // The Point function is a constructor that creates {X, Y} objects
  return (Point as unknown as new (x: number, y: number) => DollarPoint)(x, y);
}

// Generate points for a gesture pattern
function generatePatternPoints(
  pattern: GestureDirection[],
  segmentLength = 100,
  pointsPerSegment = 20,
): DollarPoint[] {
  const points: DollarPoint[] = [];
  let x = 0;
  let y = 0;

  for (const direction of pattern) {
    const vec = DIRECTION_VECTORS[direction];
    const stepX = (vec.dx * segmentLength) / pointsPerSegment;
    const stepY = (vec.dy * segmentLength) / pointsPerSegment;

    for (let i = 0; i < pointsPerSegment; i++) {
      points.push(createPoint(x, y));
      x += stepX;
      y += stepY;
    }
  }

  // Add final point
  points.push(createPoint(x, y));

  return points;
}

/**
 * Create a gesture recognizer configured with the given actions.
 */
export function createGestureRecognizer(
  actions: GestureAction[],
): IDollarRecognizer {
  const recognizer = (
    DollarRecognizer as unknown as new () => IDollarRecognizer
  )();

  // Remove built-in gestures
  recognizer.DeleteUserGestures();
  recognizer.Unistrokes.length = 0;

  // Add gesture templates for each action
  for (const action of actions) {
    if (action.pattern.length > 0) {
      const patternName = action.pattern.join("-");
      const points = generatePatternPoints(action.pattern);
      recognizer.AddGesture(patternName, points);
    }
  }

  return recognizer;
}

/**
 * Recognize a gesture from mouse trail points.
 * Returns the pattern name and score, or null if no match.
 */
export function recognizeGesture(
  recognizer: IDollarRecognizer,
  trail: { x: number; y: number }[],
  minScore = 0.7,
): { pattern: string; score: number } | null {
  if (trail.length < 2) {
    return null;
  }

  // Convert trail to $1 Point format
  const points = trail.map((p) => createPoint(p.x, p.y));

  // Use Protractor algorithm (faster)
  const result = recognizer.Recognize(points, true);

  if (result.Name !== "No match." && result.Score >= minScore) {
    return { pattern: result.Name, score: result.Score };
  }

  return null;
}
