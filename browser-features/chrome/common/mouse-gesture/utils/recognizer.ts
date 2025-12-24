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
 * Mapping of each direction to its 180-degree opposite.
 * The $1 recognizer normalizes gestures by rotating them to a canonical orientation,
 * so opposite gestures (like "left" and "right") produce the same shape signature.
 */
const OPPOSITE_DIRECTION: Record<GestureDirection, GestureDirection> = {
  right: "left",
  left: "right",
  up: "down",
  down: "up",
  upRight: "downLeft",
  downLeft: "upRight",
  upLeft: "downRight",
  downRight: "upLeft",
};

/**
 * Check if two patterns have the same shape signature when normalized by $1.
 * Two patterns have the same shape if one is the 180-degree rotation of the other.
 * This is because $1 normalizes gestures by rotating them, making opposite gestures identical.
 *
 * Examples of patterns with the same shape:
 * - ["right"] and ["left"]
 * - ["up", "right"] and ["down", "left"]
 * - ["upRight"] and ["downLeft"]
 */
function hasSameShapeSignature(
  pattern1: GestureDirection[],
  pattern2: GestureDirection[],
): boolean {
  // Patterns must have the same length
  if (pattern1.length !== pattern2.length) {
    return false;
  }

  // Check if pattern2 is the same as pattern1
  const isSame = pattern1.every((dir, i) => dir === pattern2[i]);
  if (isSame) {
    return true;
  }

  // Check if pattern2 is the 180-degree rotation of pattern1
  const isOpposite = pattern1.every(
    (dir, i) => OPPOSITE_DIRECTION[dir] === pattern2[i],
  );
  return isOpposite;
}

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
 * Returns the angle in radians, where 0 = right, PI/2 = down, ±PI = left, -PI/2 = up.
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
 * Calculate the distance between two points.
 */
function distanceBetween(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

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
    if (distanceBetween(start, trail[i]) >= MIN_MOVEMENT_DISTANCE) {
      const dx = trail[i].x - start.x;
      const dy = trail[i].y - start.y;
      // Use atan2 to get the angle (dy, dx order for screen coordinates)
      return Math.atan2(dy, dx);
    }
  }

  // If no point is far enough, use the last point
  const last = trail[trail.length - 1];
  if (distanceBetween(start, last) > 0) {
    const dx = last.x - start.x;
    const dy = last.y - start.y;
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
 * Full circle in radians, used for angle wraparound calculations.
 */
const TWO_PI = 2 * Math.PI;

/**
 * Calculate the angular difference between two angles, accounting for wraparound.
 * Returns the smallest angle between the two directions (0 to PI).
 */
function angleDifference(angle1: number, angle2: number): number {
  let diff = Math.abs(angle1 - angle2);
  // Normalize to [0, PI] range since we want the smallest angle between directions
  if (diff > Math.PI) {
    diff = TWO_PI - diff;
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
 * Since $1 normalizes gestures by rotation, opposite gestures (like "left" vs "right"
 * or ["up", "right"] vs ["down", "left"]) produce the same shape signature.
 *
 * To distinguish between these, we:
 * 1. Get the shape match from $1 recognizer
 * 2. Validate the first movement direction using arctan
 * 3. If direction doesn't match, look for patterns with the same shape signature
 *    but matching first direction
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
      // Direction doesn't match - try to find another pattern with the same shape
      // but with a matching first direction
      if (actions) {
        // Look for another action with the same shape signature and matching direction
        for (const action of actions) {
          const actionPatternName = action.pattern.join("-");
          // Skip the already-matched pattern
          if (actionPatternName === result.Name) {
            continue;
          }
          // Only consider patterns with the same shape signature (e.g., "left" matches "right")
          // and verify that the first direction matches the user's actual gesture
          if (
            hasSameShapeSignature(patternDirs, action.pattern) &&
            validateDirection(action.pattern, trail)
          ) {
            // Found a pattern with matching shape and direction - return it with the original score
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
