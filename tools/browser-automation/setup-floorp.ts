#!/usr/bin/env npx ts-node
/**
 * Floorp Dev Binary Setup Script
 * Downloads and extracts the Floorp dev binary for testing
 * 
 * SPDX-License-Identifier: MPL-2.0
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, chmodSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FLOORP_DEV_URL = "https://dev-assets.floorp.app/runtime-builds/linux-x86_64-artifacts.zip";
const FLOORP_DIR = join(__dirname, ".floorp-dev");
const FLOORP_ZIP = join(__dirname, ".floorp-dev.zip");

export async function setupFloorp(): Promise<string> {
  // Check if already setup
  const floorpBinary = findFloorpBinary();
  if (floorpBinary) {
    console.log(`✅ Floorp binary already exists at: ${floorpBinary}`);
    return floorpBinary;
  }

  console.log("📥 Downloading Floorp dev binary...");
  console.log(`   URL: ${FLOORP_DEV_URL}`);

  // Create directory
  if (!existsSync(FLOORP_DIR)) {
    mkdirSync(FLOORP_DIR, { recursive: true });
  }

  // Download the zip file
  try {
    execSync(`curl -L -o "${FLOORP_ZIP}" "${FLOORP_DEV_URL}"`, { stdio: "inherit" });
  } catch (error) {
    throw new Error(`Failed to download Floorp binary: ${error}`);
  }

  console.log("📦 Extracting Floorp binary (zip)...");
  
  // Extract the zip file
  try {
    execSync(`unzip -o "${FLOORP_ZIP}" -d "${FLOORP_DIR}"`, { stdio: "inherit" });
  } catch (error) {
    throw new Error(`Failed to extract Floorp binary: ${error}`);
  }

  // Clean up zip file
  try {
    execSync(`rm -f "${FLOORP_ZIP}"`);
  } catch {
    // Ignore cleanup errors
  }

  // Find and extract the tar.xz file inside the zip
  const tarXzFile = findTarXzFile(FLOORP_DIR);
  if (tarXzFile) {
    console.log("📦 Extracting Floorp binary (tar.xz)...");
    try {
      execSync(`tar -xJf "${tarXzFile}" -C "${FLOORP_DIR}"`, { stdio: "inherit" });
    } catch (error) {
      throw new Error(`Failed to extract tar.xz file: ${error}`);
    }
  }

  // Find and make the binary executable
  const binary = findFloorpBinary();
  if (!binary) {
    throw new Error("Could not find Floorp binary after extraction");
  }

  chmodSync(binary, 0o755);
  console.log(`✅ Floorp binary ready at: ${binary}`);

  return binary;
}

function findTarXzFile(dir: string): string | null {
  if (!existsSync(dir)) return null;
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && (entry.name.endsWith(".tar.xz") || entry.name.endsWith(".tar.zst"))) {
        return fullPath;
      }
      if (entry.isDirectory() && entry.name !== "." && entry.name !== "..") {
        const found = findTarXzFile(fullPath);
        if (found) return found;
      }
    }
  } catch {
    // Ignore errors when reading directories
  }
  return null;
}

export function findFloorpBinary(): string | null {
  if (!existsSync(FLOORP_DIR)) {
    return null;
  }

  // Look for floorp or firefox binary in common locations - prioritize nested paths
  const possiblePaths = [
    join(FLOORP_DIR, "floorp", "floorp"),
    join(FLOORP_DIR, "floorp", "firefox"),
    join(FLOORP_DIR, "firefox", "firefox"),
    join(FLOORP_DIR, "floorp"),
    join(FLOORP_DIR, "firefox"),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      // Make sure it's a file, not a directory
      if (statSync(path).isFile()) {
        return path;
      }
    }
  }

  // Search recursively for floorp or firefox binary
  function searchDir(dir: string): string | null {
    if (!existsSync(dir)) return null;
    
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile() && (entry.name === "floorp" || entry.name === "firefox")) {
          return fullPath;
        }
        if (entry.isDirectory() && entry.name !== "." && entry.name !== "..") {
          const found = searchDir(fullPath);
          if (found) return found;
        }
      }
    } catch {
      // Ignore errors when reading directories
    }
    return null;
  }

  return searchDir(FLOORP_DIR);
}

export function getFloorpDir(): string {
  return FLOORP_DIR;
}

// Run if executed directly
if (process.argv[1] && process.argv[1].includes("setup-floorp")) {
  setupFloorp()
    .then((binary) => {
      console.log(`\nFloorp binary path: ${binary}`);
    })
    .catch((error) => {
      console.error("❌ Setup failed:", error);
      process.exit(1);
    });
}
