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
  return new (Point as unknown as new (x: number, y: number) => DollarPoint)(x, y);
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
 * Segment lengths for generating multiple-size templates.
 * The $1 Unistroke Recognizer works better with multiple templates
 * at different scales to handle varying gesture sizes.
 *
 * These values represent small, medium, and large gesture sizes
 * to accommodate different screen sizes and user gesture styles.
 */
const SEGMENT_LENGTHS = [50, 100, 200, 400, 800];

/**
 * Create a $1 Recognizer instance configured with gesture patterns.
 *
 * Takes the gesture actions from configuration and adds them as templates
 * to the recognizer. Each pattern is converted from directions to points
 * at multiple sizes to improve recognition accuracy across different
 * gesture scales.
 */
export function createRecognizer(actions: GestureAction[]): IDollarRecognizer {
  // Create a new $1 Recognizer instance
  const recognizer = new (DollarRecognizer as unknown as new () => IDollarRecognizer)();

  // Clear the built-in gesture templates
  recognizer.DeleteUserGestures();
  recognizer.Unistrokes.length = 0;

  // Add each configured gesture as a template at multiple sizes
  for (const action of actions) {
    if (action.pattern.length > 0) {
      // Use the pattern as a hyphen-joined string for the template name
      const templateName = action.pattern.join("-");

      // Add templates at multiple sizes for better recognition
      // The $1 Recognizer normalizes gestures, but having multiple
      // sizes can help with edge cases and improve accuracy
      for (const segmentLength of SEGMENT_LENGTHS) {
        const points = convertPatternToPoints(action.pattern, segmentLength);
        recognizer.AddGesture(templateName, points);
      }
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
 * Calculate the expected direction vector for a pattern.
 * This computes the overall direction from start to end point.
 */
function getPatternDirection(pattern: GestureDirection[]): { dx: number; dy: number } {
  let totalDx = 0;
  let totalDy = 0;

  for (const direction of pattern) {
    const vector = DIRECTION_VECTORS[direction];
    totalDx += vector.dx;
    totalDy += vector.dy;
  }

  // Normalize the vector
  const length = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
  if (length === 0) {
    return { dx: 0, dy: 0 };
  }

  return { dx: totalDx / length, dy: totalDy / length };
}

/**
 * Calculate the actual direction vector from a mouse trail.
 * Compares first and last points to determine overall direction.
 */
function getTrailDirection(trail: { x: number; y: number }[]): { dx: number; dy: number } {
  if (trail.length < 2) {
    return { dx: 0, dy: 0 };
  }

  const first = trail[0];
  const last = trail[trail.length - 1];

  const dx = last.x - first.x;
  const dy = last.y - first.y;

  // Normalize the vector
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) {
    return { dx: 0, dy: 0 };
  }

  return { dx: dx / length, dy: dy / length };
}

/**
 * Validate that the trail direction matches the expected pattern direction.
 * Uses dot product to check if they point in the same general direction.
 * This helps distinguish between opposite gestures like "upRight" vs "downLeft"
 * which the $1 recognizer treats as the same after normalization.
 */
function validateDirection(
  pattern: GestureDirection[],
  trail: { x: number; y: number }[],
): boolean {
  const expectedDir = getPatternDirection(pattern);
  const actualDir = getTrailDirection(trail);

  // If either vector is zero, we can't validate direction
  if (
    (expectedDir.dx === 0 && expectedDir.dy === 0) ||
    (actualDir.dx === 0 && actualDir.dy === 0)
  ) {
    return true; // Allow it to pass
  }

  // Calculate dot product - positive means same direction, negative means opposite
  const dotProduct = expectedDir.dx * actualDir.dx + expectedDir.dy * actualDir.dy;

  // Require positive dot product (vectors pointing in same general direction)
  return dotProduct > 0;
}

/**
 * Recognize a gesture from mouse trail points.
 *
 * Uses the $1 Recognizer's Protractor algorithm for fast matching.
 * Additionally validates that the gesture direction matches by comparing
 * first and last points, to distinguish between opposite gestures like
 * "upRight" and "downLeft" which $1 treats as identical after normalization.
 *
 * Returns the matched pattern name and confidence score if successful.
 */
export function recognize(
  recognizer: IDollarRecognizer,
  trail: { x: number; y: number }[],
  minScore = 0.7,
  actions?: GestureAction[],
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
    // Parse the pattern from the result name (format: "up-right-down")
    const patternDirs = result.Name.split("-") as GestureDirection[];

    // Validate direction by comparing first and last points
    // This distinguishes opposite gestures like "upRight" vs "downLeft"
    if (!validateDirection(patternDirs, trail)) {
      // Direction doesn't match - try to find another pattern with matching direction
      if (actions) {
        // Look for another action whose direction matches the user's actual trail
        for (const action of actions) {
          const actionPatternName = action.pattern.join("-");
          // Skip the already-matched pattern and only accept patterns with matching direction
          if (actionPatternName !== result.Name && validateDirection(action.pattern, trail)) {
            // Found a pattern with matching direction - return it with the original score
            // since the shape was already validated by the $1 recognizer
            return {
              patternName: actionPatternName,
              score: result.Score,
            };
          }
        }
      }
      return null;
    }

    return {
      patternName: result.Name,
      score: result.Score,
    };
  }

  return null;
}
