/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Mouse gesture recognizer using the $1 Unistroke Recognizer algorithm.
 *
 * This module provides the core gesture recognition functionality:
 * - Converts direction patterns from preferences into point arrays
 * - Uses the $1 Recognizer to match mouse trails against patterns
 *
 * The $1 Unistroke Recognizer is a simple, fast algorithm for recognizing
 * single-stroke gestures by comparing them against a set of templates.
 */

import {
  DollarRecognizer,
  Point,
  type DollarPoint,
  type IDollarRecognizer,
} from "./dollar.ts";
import type { GestureDirection, GestureAction } from "../config.ts";

/**
 * Direction vectors mapping each gesture direction to X/Y deltas.
 * Used to convert direction patterns to point sequences.
 */
const DIRECTION_VECTORS: Record<GestureDirection, { dx: number; dy: number }> = {
  right: { dx: 1, dy: 0 },
  downRight: { dx: 0.707, dy: 0.707 },
  down: { dx: 0, dy: 1 },
  downLeft: { dx: -0.707, dy: 0.707 },
  left: { dx: -1, dy: 0 },
  upLeft: { dx: -0.707, dy: -0.707 },
  up: { dx: 0, dy: -1 },
  upRight: { dx: 0.707, dy: -0.707 },
};

/**
 * Create a $1 Recognizer Point object.
 */
function createPoint(x: number, y: number): DollarPoint {
  return (Point as unknown as new (x: number, y: number) => DollarPoint)(x, y);
}

/**
 * Convert a direction pattern from preferences to an array of points.
 *
 * This is the key conversion function that bridges the preference format
 * (array of direction names like ["up", "right"]) with the $1 Recognizer
 * format (array of {X, Y} points).
 *
 * Example: ["up", "right"] becomes a series of points forming an L shape.
 */
export function convertPatternToPoints(
  pattern: GestureDirection[],
  segmentLength = 100,
  pointsPerSegment = 20,
): DollarPoint[] {
  const points: DollarPoint[] = [];
  let currentX = 0;
  let currentY = 0;

  // For each direction in the pattern, generate points along that direction
  for (const direction of pattern) {
    const vector = DIRECTION_VECTORS[direction];
    const stepX = (vector.dx * segmentLength) / pointsPerSegment;
    const stepY = (vector.dy * segmentLength) / pointsPerSegment;

    for (let i = 0; i < pointsPerSegment; i++) {
      points.push(createPoint(currentX, currentY));
      currentX += stepX;
      currentY += stepY;
    }
  }

  // Add the final point
  points.push(createPoint(currentX, currentY));

  return points;
}

/**
 * Convert mouse trail coordinates to $1 Recognizer point format.
 */
export function convertTrailToPoints(
  trail: { x: number; y: number }[],
): DollarPoint[] {
  return trail.map((point) => createPoint(point.x, point.y));
}

/**
 * Create a $1 Recognizer instance configured with gesture patterns.
 *
 * Takes the gesture actions from configuration and adds them as templates
 * to the recognizer. Each pattern is converted from directions to points.
 */
export function createRecognizer(actions: GestureAction[]): IDollarRecognizer {
  // Create a new $1 Recognizer instance
  const recognizer = (DollarRecognizer as unknown as new () => IDollarRecognizer)();

  // Clear the built-in gesture templates
  recognizer.DeleteUserGestures();
  recognizer.Unistrokes.length = 0;

  // Add each configured gesture as a template
  for (const action of actions) {
    if (action.pattern.length > 0) {
      // Use the pattern as a hyphen-joined string for the template name
      const templateName = action.pattern.join("-");

      // Convert the direction pattern to points
      const points = convertPatternToPoints(action.pattern);

      // Add the template to the recognizer
      recognizer.AddGesture(templateName, points);
    }
  }

  return recognizer;
}

/**
 * Result of a gesture recognition attempt.
 */
export interface RecognitionResult {
  patternName: string;
  score: number;
}

/**
 * Recognize a gesture from mouse trail points.
 *
 * Uses the $1 Recognizer's Protractor algorithm for fast matching.
 * Returns the matched pattern name and confidence score if successful.
 */
export function recognize(
  recognizer: IDollarRecognizer,
  trail: { x: number; y: number }[],
  minScore = 0.7,
): RecognitionResult | null {
  // Need at least 2 points to recognize
  if (trail.length < 2) {
    return null;
  }

  // Convert mouse trail to $1 Recognizer format
  const points = convertTrailToPoints(trail);

  // Use Protractor algorithm (useProtractor = true) for faster recognition
  const result = recognizer.Recognize(points, true);

  // Check if we got a valid match above the threshold
  if (result.Name !== "No match." && result.Score >= minScore) {
    return {
      patternName: result.Name,
      score: result.Score,
    };
  }

  return null;
}
