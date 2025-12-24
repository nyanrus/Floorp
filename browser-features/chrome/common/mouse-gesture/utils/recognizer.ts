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
 * Shape variant entry containing pattern name and its first direction angle.
 * Used to store multiple patterns that share the same shape signature.
 */
interface ShapeVariant {
  patternName: string;
  pattern: GestureDirection[];
  firstAngle: number | null;
}

/**
 * Shape database entry containing the representative shape key and its variants.
 * The shape key is the pattern name used to register with $1 recognizer.
 * Variants are all patterns that share this shape signature.
 */
export interface ShapeEntry {
  shapeKey: string;
  variants: ShapeVariant[];
}

/**
 * Shape database that maps shape keys to their entries.
 * This allows registering only unique shapes to $1 while tracking
 * all direction variants for each shape.
 */
export type ShapeDatabase = Map<string, ShapeEntry>;

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
 * Result of creating a recognizer, including the shape database.
 */
export interface RecognizerWithShapeDb {
  recognizer: IDollarRecognizer;
  shapeDb: ShapeDatabase;
}

/**
 * Create a $1 Recognizer instance configured with gesture patterns.
 *
 * Takes the gesture actions from configuration and adds them as templates
 * to the recognizer. Only unique shapes are registered to $1; patterns that
 * produce the same shape signature are stored as variants in the shape database.
 *
 * The first pattern encountered for each unique shape becomes the representative
 * template. Subsequent patterns with the same shape are added as variants,
 * distinguished by their first direction angle.
 */
export function createRecognizer(actions: GestureAction[]): RecognizerWithShapeDb {
  // Create a new $1 Recognizer instance
  const recognizer = new (DollarRecognizer as unknown as new () => IDollarRecognizer)();

  // Clear the built-in gesture templates
  recognizer.DeleteUserGestures();
  recognizer.Unistrokes.length = 0;

  // Build shape database - maps shape keys to their variants
  const shapeDb: ShapeDatabase = new Map();

  // Track which shapes have been registered to avoid duplicates
  const registeredShapes = new Set<string>();

  // Add each configured gesture as a template
  for (const action of actions) {
    if (action.pattern.length > 0) {
      // Use the pattern as a hyphen-joined string for the template name
      const patternName = action.pattern.join("-");
      const firstAngle = getPatternFirstAngle(action.pattern);

      // Create the shape variant entry
      const variant: ShapeVariant = {
        patternName,
        pattern: action.pattern,
        firstAngle,
      };

      // Check if this exact pattern name is already registered as a shape key
      if (shapeDb.has(patternName)) {
        // This pattern is already the representative for its shape, add as variant
        shapeDb.get(patternName)!.variants.push(variant);
      } else {
        // Check if we should add to an existing shape entry
        // by checking if any existing shape key matches this pattern
        let foundExistingShape = false;
        for (const [shapeKey, entry] of shapeDb) {
          // If the recognizer returns this shapeKey when given the pattern's points,
          // they share the same shape signature
          const testPoints = convertPatternToPoints(action.pattern, 100);
          const testResult = recognizer.Recognize(testPoints, true);
          if (testResult.Name === shapeKey && testResult.Score > 0.95) {
            // Same shape - add as variant
            entry.variants.push(variant);
            foundExistingShape = true;
            break;
          }
        }

        if (!foundExistingShape) {
          // New unique shape - register to $1 and create new entry
          shapeDb.set(patternName, {
            shapeKey: patternName,
            variants: [variant],
          });

          // Only register if not already registered
          if (!registeredShapes.has(patternName)) {
            registeredShapes.add(patternName);

            // Add templates at multiple sizes for better recognition
            for (const segmentLength of SEGMENT_LENGTHS) {
              const points = convertPatternToPoints(action.pattern, segmentLength);
              recognizer.AddGesture(patternName, points);
            }
          }
        }
      }
    }
  }

  return { recognizer, shapeDb };
}

/**
 * Result of a gesture recognition attempt.
 */
export interface RecognitionResult {
  patternName: string;
  score: number;
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
 * Recognize a gesture from mouse trail points using the shape database.
 *
 * Uses the $1 Recognizer's Protractor algorithm for fast shape matching.
 * Since $1 normalizes gestures by rotation, opposite gestures (like "left" vs "right"
 * or ["up", "right"] vs ["down", "left"]) produce the same shape signature.
 *
 * To distinguish between these, we:
 * 1. Get the shape match from $1 recognizer (returns the shape key)
 * 2. Look up all variants for that shape in the shape database
 * 3. Find the first variant whose first direction matches the trail's first direction
 *
 * Returns the matched pattern name and confidence score if successful.
 */
export function recognize(
  recognizer: IDollarRecognizer,
  trail: { x: number; y: number }[],
  minScore = 0.7,
  shapeDb?: ShapeDatabase,
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
    // The result.Name is the shape key used to register with $1
    const shapeKey = result.Name;

    // If we have a shape database, look up variants and match by direction
    if (shapeDb) {
      const shapeEntry = shapeDb.get(shapeKey);
      if (shapeEntry) {
        // Get the trail's first direction angle
        const trailAngle = getTrailFirstAngle(trail);

        // Find the first variant that matches the trail's direction
        for (const variant of shapeEntry.variants) {
          // If either angle couldn't be determined, use this variant
          if (trailAngle === null || variant.firstAngle === null) {
            return {
              patternName: variant.patternName,
              score: result.Score,
            };
          }

          // Compare angles - they should be within 90 degrees of each other
          const diff = angleDifference(variant.firstAngle, trailAngle);
          if (diff <= MAX_ANGLE_DIFFERENCE) {
            return {
              patternName: variant.patternName,
              score: result.Score,
            };
          }
        }

        // No variant matched the direction
        return null;
      }
    }

    // Fallback: if no shape database, just return the shape key as the pattern name
    // (for backward compatibility during transition)
    return {
      patternName: result.Name,
      score: result.Score,
    };
  }

  return null;
}
