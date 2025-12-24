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
  return new (Point as unknown as new (x: number, y: number) => DollarPoint)(x, y);
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
 * Segment lengths for generating multiple-size templates.
 * The $1 Unistroke Recognizer works better with multiple templates
 * at different scales to handle varying gesture sizes.
 */
const SEGMENT_LENGTHS = [50, 100, 200, 400, 800];

/**
 * Create a gesture recognizer configured with the given actions.
 */
export function createGestureRecognizer(
  actions: GestureAction[],
): IDollarRecognizer {
  const recognizer = new (
    DollarRecognizer as unknown as new () => IDollarRecognizer
  )();

  // Remove built-in gestures
  recognizer.DeleteUserGestures();
  recognizer.Unistrokes.length = 0;

  // Add gesture templates for each action at multiple sizes
  for (const action of actions) {
    if (action.pattern.length > 0) {
      const patternName = action.pattern.join("-");
      // Add templates at multiple sizes for better recognition
      for (const segmentLength of SEGMENT_LENGTHS) {
        const points = generatePatternPoints(action.pattern, segmentLength);
        recognizer.AddGesture(patternName, points);
      }
    }
  }

  return recognizer;
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
 * Returns the pattern name and score, or null if no match.
 *
 * Additionally validates that the gesture direction matches by comparing
 * first and last points, to distinguish between opposite gestures like
 * "upRight" and "downLeft" which $1 treats as identical after normalization.
 */
export function recognizeGesture(
  recognizer: IDollarRecognizer,
  trail: { x: number; y: number }[],
  minScore = 0.7,
  actions?: GestureAction[],
): { pattern: string; score: number } | null {
  if (trail.length < 2) {
    return null;
  }

  // Convert trail to $1 Point format
  const points = trail.map((p) => createPoint(p.x, p.y));

  // Use Protractor algorithm (faster)
  const result = recognizer.Recognize(points, true);

  if (result.Name !== "No match." && result.Score >= minScore) {
    // Parse the pattern from the result name (format: "up-right-down")
    const patternDirs = result.Name.split("-") as GestureDirection[];

    // Validate direction by comparing first and last points
    // This distinguishes opposite gestures like "upRight" vs "downLeft"
    if (!validateDirection(patternDirs, trail)) {
      // Direction doesn't match - try to find the opposite pattern
      if (actions) {
        // Look for another action with opposite direction
        for (const action of actions) {
          const actionPatternName = action.pattern.join("-");
          if (actionPatternName !== result.Name && validateDirection(action.pattern, trail)) {
            // Check if this pattern would also match the shape
            const oppositePoints = generatePatternPoints(action.pattern);
            const oppositeResult = recognizer.Recognize(oppositePoints, true);
            if (oppositeResult.Score >= minScore) {
              return {
                pattern: actionPatternName,
                score: result.Score,
              };
            }
          }
        }
      }
      return null;
    }

    return { pattern: result.Name, score: result.Score };
  }

  return null;
}
