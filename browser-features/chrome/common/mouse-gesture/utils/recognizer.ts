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
 * Calculate the angle of the first direction in a pattern using arctan.
 * Returns the angle in radians, where 0 = right, PI/2 = down, PI = left, -PI/2 = up.
 * This helps distinguish opposite gestures like "up-down" vs "down-up" by
 * comparing first movement direction.
 */
function getPatternFirstAngle(pattern: GestureDirection[]): number | null {
  if (pattern.length === 0) {
    return null;
  }

  // Get the first direction's vector
  const firstDirection = pattern[0];
  const vector = DIRECTION_VECTORS[firstDirection];

  // Use atan2 to get the angle (dy, dx order for screen coordinates where Y increases downward)
  return Math.atan2(vector.dy, vector.dx);
}

/**
 * Minimum distance (in pixels) for a movement to be considered significant.
 * This threshold helps filter out noise in the mouse trail.
 */
const MIN_MOVEMENT_DISTANCE = 15;

/**
 * Calculate the angle of the first significant movement from a mouse trail using arctan.
 * Finds the first point that is far enough from the start to determine direction.
 * Returns the angle in radians, or null if no significant movement is found.
 */
function getTrailFirstAngle(trail: { x: number; y: number }[]): number | null {
  if (trail.length < 2) {
    return null;
  }

  const start = trail[0];

  // Find the first point that is far enough to determine direction
  for (let i = 1; i < trail.length; i++) {
    const dx = trail[i].x - start.x;
    const dy = trail[i].y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= MIN_MOVEMENT_DISTANCE) {
      // Use atan2 to get the angle (dy, dx order for screen coordinates)
      return Math.atan2(dy, dx);
    }
  }

  // If no point is far enough, use the last point
  const last = trail[trail.length - 1];
  const dx = last.x - start.x;
  const dy = last.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > 0) {
    return Math.atan2(dy, dx);
  }

  return null;
}

/**
 * Maximum allowed angle difference (in radians) for direction validation.
 * PI/2 (90 degrees) allows for some tolerance while still distinguishing
 * opposite directions (which differ by PI or 180 degrees).
 */
const MAX_ANGLE_DIFFERENCE = Math.PI / 2;

/**
 * Calculate the angular difference between two angles, accounting for wraparound.
 * Returns the smallest angle between the two directions (0 to PI).
 */
function angleDifference(angle1: number, angle2: number): number {
  let diff = Math.abs(angle1 - angle2);
  // Normalize to [0, PI] range since we want the smallest angle between directions
  if (diff > Math.PI) {
    diff = 2 * Math.PI - diff;
  }
  return diff;
}

/**
 * Validate that the trail's first movement direction matches the pattern's first direction.
 * Uses arctan-based angle comparison to distinguish opposite gestures like
 * "up-down" vs "down-up" and "upRight" vs "downLeft".
 */
function validateDirection(
  pattern: GestureDirection[],
  trail: { x: number; y: number }[],
): boolean {
  const expectedAngle = getPatternFirstAngle(pattern);
  const actualAngle = getTrailFirstAngle(trail);

  // If either angle couldn't be determined, allow it to pass
  if (expectedAngle === null || actualAngle === null) {
    return true;
  }

  // Compare angles - they should be within 90 degrees of each other
  const diff = angleDifference(expectedAngle, actualAngle);
  return diff <= MAX_ANGLE_DIFFERENCE;
}

/**
 * Recognize a gesture from mouse trail points.
 *
 * Uses the $1 Recognizer's Protractor algorithm for fast matching.
 * Additionally validates the first movement direction using arctan to
 * distinguish between opposite gestures like "up-down" vs "down-up" and
 * "upRight" vs "downLeft" which $1 treats as identical after normalization.
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

    // Validate first movement direction using arctan-based comparison
    // This distinguishes opposite gestures like "up-down" vs "down-up"
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
