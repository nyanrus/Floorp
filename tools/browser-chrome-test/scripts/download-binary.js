#!/usr/bin/env node
/**
 * Downloads the Floorp dev binary for testing.
 *
 * This script fetches the latest dev build from dev-assets.floorp.app
 * and extracts it to a local directory for use with browser-chrome tests.
 *
 * Maintainers: Run this script before running tests.
 */

import { mkdirSync, existsSync, unlinkSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Download URL for the Linux x86_64 dev binary
const BINARY_URL = 'https://dev-assets.floorp.app/runtime-builds/linux-x86_64-artifacts.zip';
const BIN_DIR = join(PROJECT_ROOT, 'bin');
const ZIP_PATH = join(BIN_DIR, 'floorp-artifacts.zip');

/**
 * Downloads a file from a URL to a local path using curl.
 * This is more reliable than fetch for large files.
 */
async function downloadFile(url, destPath) {
  console.log(`Downloading from: ${url}`);
  console.log(`Saving to: ${destPath}`);

  const destDir = dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  try {
    execSync(`curl -L --progress-bar -o "${destPath}" "${url}"`, {
      stdio: 'inherit'
    });
    console.log('Download complete.');
  } catch (error) {
    throw new Error(`Download failed: ${error.message}`);
  }
}

/**
 * Extracts the downloaded zip file using unzip command.
 * The zip contains a tar.xz file that also needs to be extracted.
 */
function extractArchive(zipPath, destDir) {
  console.log(`Extracting ${zipPath} to ${destDir}...`);

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  try {
    // First, extract the outer zip file
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
      stdio: 'inherit'
    });

    // Look for any tar.xz files inside and extract them
    const tarXzFiles = execSync(`find "${destDir}" -name "*.tar.xz" 2>/dev/null || true`)
      .toString().trim().split('\n').filter(Boolean);

    for (const tarXz of tarXzFiles) {
      console.log(`Extracting nested archive: ${tarXz}`);
      execSync(`tar -xJf "${tarXz}" -C "${destDir}"`, {
        stdio: 'inherit'
      });
      // Remove the tar.xz after extraction
      unlinkSync(tarXz);
    }

    console.log('Extraction complete.');
  } catch (error) {
    throw new Error(`Failed to extract archive: ${error.message}`);
  }
}

/**
 * Finds the Floorp executable in the extracted directory.
 */
function findExecutable(binDir) {
  // Look for the floorp or floorp-bin executable
  const candidates = [
    join(binDir, 'floorp', 'floorp-bin'),
    join(binDir, 'floorp', 'floorp'),
    join(binDir, 'floorp-bin'),
    join(binDir, 'floorp')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      // Make it executable
      try {
        chmodSync(candidate, 0o755);
      } catch (e) {
        // Ignore chmod errors
      }
      return candidate;
    }
  }

  // If not found, list what we have
  console.log('Contents of bin directory:');
  try {
    execSync(`find "${binDir}" -type f -name "*floorp*" | head -20`, {
      stdio: 'inherit'
    });
  } catch (e) {
    // Ignore
  }

  return null;
}

async function main() {
  console.log('=== Floorp Dev Binary Downloader ===\n');

  try {
    // Clean up old files
    if (existsSync(ZIP_PATH)) {
      console.log('Removing old zip file...');
      unlinkSync(ZIP_PATH);
    }

    // Download the binary
    await downloadFile(BINARY_URL, ZIP_PATH);

    // Extract the archive (zip containing tar.xz)
    extractArchive(ZIP_PATH, BIN_DIR);

    // Find the executable
    const execPath = findExecutable(BIN_DIR);
    if (execPath) {
      console.log(`\nFloorp executable found at: ${execPath}`);
      console.log('\nYou can now run tests with:');
      console.log('  npm test');
    } else {
      console.log('\nWarning: Could not locate Floorp executable.');
      console.log('Please check the bin directory and update the executable path manually.');
    }

    // Clean up zip file
    if (existsSync(ZIP_PATH)) {
      console.log('\nCleaning up zip file...');
      unlinkSync(ZIP_PATH);
    }

    console.log('\nDone!');
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main();
