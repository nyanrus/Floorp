# Memory Leak Testing Guide

## Overview

This guide provides practical steps for testing and preventing memory leaks in the Floorp browser codebase.

## Prerequisites

- Chrome or Firefox DevTools
- Understanding of JavaScript memory management
- Familiarity with the component being tested

## Manual Testing with Browser DevTools

### Step 1: Open DevTools Memory Profiler

1. Open Floorp browser
2. Press F12 to open DevTools
3. Navigate to the **Memory** tab

### Step 2: Take Baseline Snapshot

1. Before interacting with the component, take a heap snapshot:
   - Click the "Take snapshot" button (camera icon)
   - This captures the current memory state
2. Note the snapshot size and number

### Step 3: Exercise the Component

Perform actions that should trigger cleanup:

- **For components with mount/unmount**: Open and close the component multiple times
- **For timers**: Wait for intervals/timeouts to complete
- **For event listeners**: Trigger events and then navigate away
- **For observers**: Trigger mutations and then disconnect

Example for testing the Counter component:
```javascript
// In browser console
// 1. Mount the counter (navigate to page with counter)
// 2. Wait 10 seconds
// 3. Unmount the counter (navigate away)
// 4. Force garbage collection
// 5. Take snapshot
```

### Step 4: Force Garbage Collection

1. Click the trash can icon in DevTools Memory tab
2. Wait a few seconds for GC to complete
3. Repeat 2-3 times to ensure thorough cleanup

### Step 5: Take Final Snapshot

1. Take another heap snapshot
2. Compare with the baseline snapshot

### Step 6: Analyze Results

#### Compare Snapshots

1. Select the second snapshot
2. Change view to "Comparison"
3. Select the baseline snapshot as comparison target
4. Look for:
   - **Increased detached DOM nodes**: Indicates DOM elements not properly cleaned up
   - **Retained timers**: Look for `Timer` or `Interval` objects
   - **Event listeners**: Search for event-related objects
   - **Observers**: Search for `MutationObserver`, `IntersectionObserver`, etc.

#### Identify Memory Leaks

Memory leak indicators:
- Objects that should be garbage collected but aren't
- Growing number of detached DOM nodes after repeated operations
- Timers that persist after component unmount
- Event listeners that weren't removed

### Step 7: Fix and Re-test

1. Implement cleanup based on findings
2. Repeat testing steps
3. Verify memory usage returns to baseline

## Automated Testing Strategies

### 1. Unit Tests for Cleanup Functions

```typescript
// Example test for Counter cleanup
import { describe, it, expect, beforeEach, afterEach } from '@test-framework';
import { Counter } from './Counter';

describe('Counter Memory Management', () => {
  let intervalCount: number;
  
  beforeEach(() => {
    intervalCount = getActiveIntervalCount();
  });
  
  afterEach(() => {
    const currentCount = getActiveIntervalCount();
    expect(currentCount).toBe(intervalCount);
  });
  
  it('should clean up interval on unmount', () => {
    const { unmount } = render(<Counter />);
    expect(getActiveIntervalCount()).toBeGreaterThan(intervalCount);
    unmount();
    expect(getActiveIntervalCount()).toBe(intervalCount);
  });
});
```

### 2. Integration Tests

```typescript
// Example integration test
describe('Download Bar Integration', () => {
  it('should properly clean up resources', async () => {
    const { cleanup } = await import('./downloadbar');
    
    // Initialize
    init();
    
    // Verify resources are allocated
    const scrollElem = document.getElementById('downloadsListBox');
    const initialListenerCount = getEventListenerCount(scrollElem);
    
    // Cleanup
    cleanup();
    
    // Verify cleanup
    const finalListenerCount = getEventListenerCount(scrollElem);
    expect(finalListenerCount).toBe(initialListenerCount);
  });
});
```

### 3. Memory Leak Detection in CI/CD

Consider adding memory leak checks to your CI pipeline:

```yaml
# Example GitHub Actions workflow
name: Memory Leak Detection
on: [pull_request]
jobs:
  memory-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run memory leak tests
        run: npm run test:memory
```

## Common Memory Leak Patterns and How to Test

### Pattern 1: Timers Not Cleared

**Test**:
```javascript
// Before
const timerCount = getTimerCount();

// Create component with timer
mountComponent();

// After mount
expect(getTimerCount()).toBeGreaterThan(timerCount);

// Unmount
unmountComponent();

// After unmount
expect(getTimerCount()).toBe(timerCount);
```

### Pattern 2: Event Listeners Not Removed

**Test**:
```javascript
const element = document.getElementById('test-element');
const beforeListeners = getEventListeners(element);

// Add listeners
component.init();

const afterInit = getEventListeners(element);
expect(afterInit.length).toBeGreaterThan(beforeListeners.length);

// Cleanup
component.cleanup();

const afterCleanup = getEventListeners(element);
expect(afterCleanup.length).toBe(beforeListeners.length);
```

### Pattern 3: Observers Not Disconnected

**Test**:
```javascript
// Track active observers
const observerRegistry = new WeakSet();

// Monkey-patch MutationObserver
const OriginalObserver = MutationObserver;
global.MutationObserver = class extends OriginalObserver {
  constructor(...args) {
    super(...args);
    observerRegistry.add(this);
  }
  
  disconnect() {
    super.disconnect();
    observerRegistry.delete(this);
  }
};

// Test component
const component = createComponent();
expect(observerRegistry.size).toBeGreaterThan(0);

component.cleanup();
expect(observerRegistry.size).toBe(0);

// Restore
global.MutationObserver = OriginalObserver;
```

## Performance Testing

### Measure Memory Usage Over Time

```javascript
async function testMemoryUsage(iterations = 100) {
  const measurements = [];
  
  for (let i = 0; i < iterations; i++) {
    // Mount component
    const component = mountComponent();
    
    // Measure memory
    if (performance.memory) {
      measurements.push({
        iteration: i,
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      });
    }
    
    // Unmount and cleanup
    component.unmount();
    
    // Force GC if available
    if (global.gc) global.gc();
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Analyze trend
  const avgMemoryIncrease = calculateTrend(measurements);
  
  // Memory should not continuously increase
  expect(avgMemoryIncrease).toBeLessThan(ACCEPTABLE_THRESHOLD);
}
```

## Browser-Specific Tools

### Chrome DevTools Memory Profiler

Features:
- Heap snapshots
- Allocation timeline
- Allocation sampling

### Firefox DevTools Memory Tool

Features:
- Memory snapshots
- Dominators view
- Tree map visualization

## Best Practices for Testing

1. **Test in isolation**: Test each component independently
2. **Use fresh browser contexts**: Start with a clean slate
3. **Multiple iterations**: Run mount/unmount cycles multiple times
4. **Force GC**: Always force garbage collection before taking snapshots
5. **Establish baselines**: Know what "normal" memory usage looks like
6. **Document expected behavior**: Clearly define what resources should be cleaned up

## Debugging Memory Leaks

### Use Console Profiling

```javascript
// Start profiling
console.profile('ComponentLifecycle');

// Mount component
mountComponent();

// Interact
performActions();

// Unmount
unmountComponent();

// Stop profiling
console.profileEnd('ComponentLifecycle');
```

### Use Memory Timeline

1. Open DevTools Performance tab
2. Enable "Memory" checkbox
3. Start recording
4. Perform component lifecycle
5. Stop recording
6. Analyze memory graph for unexpected increases

### Identify Retaining Paths

When you find a leaked object:
1. Select the object in the heap snapshot
2. Look at "Retainers" section
3. Follow the chain to find what's holding the reference
4. Fix the code at the root cause

## Example: Testing Counter Component

```javascript
describe('Counter Component Memory Leak Tests', () => {
  test('Timer cleanup on unmount', async () => {
    // Setup
    const { unmount } = render(<Counter />);
    await waitFor(() => expect(screen.getByText(/Count/)).toBeInTheDocument());
    
    // Get baseline interval count
    const beforeUnmount = getActiveTimerCount();
    expect(beforeUnmount).toBeGreaterThan(0);
    
    // Unmount
    unmount();
    
    // Verify cleanup
    const afterUnmount = getActiveTimerCount();
    expect(afterUnmount).toBeLessThan(beforeUnmount);
  });
  
  test('No memory growth after multiple mount/unmount cycles', async () => {
    const iterations = 50;
    const measurements = [];
    
    for (let i = 0; i < iterations; i++) {
      const { unmount } = render(<Counter />);
      await waitFor(() => expect(screen.getByText(/Count/)).toBeInTheDocument());
      
      if (performance.memory) {
        measurements.push(performance.memory.usedJSHeapSize);
      }
      
      unmount();
      
      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Check that memory doesn't grow continuously
    const firstHalf = measurements.slice(0, iterations / 2);
    const secondHalf = measurements.slice(iterations / 2);
    
    const avgFirst = average(firstHalf);
    const avgSecond = average(secondHalf);
    
    // Memory in second half should not be significantly higher
    const increase = (avgSecond - avgFirst) / avgFirst;
    expect(increase).toBeLessThan(0.1); // Less than 10% increase
  });
});
```

## Conclusion

Regular memory leak testing is essential for maintaining browser performance. Follow these practices:

1. Test during development, not just before release
2. Automate where possible
3. Document memory expectations
4. Review cleanup code in code reviews
5. Use profiling tools to understand memory behavior
6. Address leaks as soon as they're discovered

By following this guide, you can ensure that Floorp components properly manage memory and provide a smooth user experience.
