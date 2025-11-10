# Memory Leak Research and Prevention

## Overview

This document outlines the memory leak patterns identified in the Floorp codebase and provides best practices for preventing memory leaks in browser extensions and components.

## Identified Memory Leaks

### 1. Critical: Counter Component (browser-features/chrome/example/counter/Counter.tsx)

**Issue**: `setInterval` was called without proper cleanup in a SolidJS component.

**Pattern**:
```typescript
// BAD - Memory Leak
export function Counter() {
  const [count, setCount] = createSignal(0);
  setInterval(() => setCount(count() + 1), 1000);
  return <div>Count: {count()}</div>;
}
```

**Fix**: Use SolidJS `onCleanup` to properly dispose of intervals.
```typescript
// GOOD - Proper cleanup
import { createSignal, onCleanup } from "solid-js";

export function Counter() {
  const [count, setCount] = createSignal(0);
  const intervalId = setInterval(() => setCount(count() + 1), 1000);
  onCleanup(() => clearInterval(intervalId));
  return <div>Count: {count()}</div>;
}
```

### 2. Medium: Download Bar Event Listener (browser-features/chrome/static/downloadbar/index.ts)

**Issue**: Event listener added without removal mechanism during component lifecycle.

**Pattern**:
```typescript
// BAD - Potential Memory Leak
const scrollElem = document.getElementById("downloadsListBox");
scrollElem?.addEventListener("wheel", (e) => {
  // handler code
});
```

**Fix**: Store event handler reference and provide cleanup function.
```typescript
// GOOD - Proper cleanup
const wheelHandler = (e: WheelEvent) => {
  // handler code
};
scrollElem?.addEventListener("wheel", wheelHandler);

// Store dispose function
let dispose = createRoot((disposeFn) => {
  // ... setup code ...
  return () => {
    scrollElem?.removeEventListener("wheel", wheelHandler);
    disposeFn();
  };
});

// In cleanup:
if (dispose) {
  dispose();
  dispose = null;
}
```

### 3. Medium: Context Menu Observer (browser-features/chrome/utils/context-menu.tsx)

**Issue**: MutationObserver created but never disconnected, leading to memory leaks when context menu utilities are disposed.

**Pattern**:
```typescript
// BAD - Observer never disconnected
const observer = new MutationObserver(() => { /* ... */ });
observer.observe(targetNode, { attributes: true });
```

**Fix**: Provide cleanup function to disconnect observer.
```typescript
// GOOD - Proper cleanup
const observer = new MutationObserver(() => { /* ... */ });
observer.observe(targetNode, { attributes: true });

export function cleanup() {
  observer.disconnect();
}
```

## Memory Leak Patterns to Avoid

### 1. Timers (setInterval, setTimeout)

**Always** clear timers when components are unmounted or no longer needed.

**React/Solid Example**:
```typescript
// SolidJS
import { onCleanup } from "solid-js";

const timerId = setInterval(() => { /* ... */ }, 1000);
onCleanup(() => clearInterval(timerId));

// React
useEffect(() => {
  const timerId = setInterval(() => { /* ... */ }, 1000);
  return () => clearInterval(timerId);
}, []);
```

### 2. Event Listeners

**Always** remove event listeners when they're no longer needed.

```typescript
// Store handler reference for later removal
const handler = (e: Event) => { /* ... */ };
element.addEventListener('click', handler);

// Cleanup
element.removeEventListener('click', handler);
```

**Note**: Using anonymous functions makes cleanup impossible:
```typescript
// BAD - Can't be cleaned up
element.addEventListener('click', (e) => { /* ... */ });
```

### 3. Observers (MutationObserver, IntersectionObserver, ResizeObserver)

**Always** disconnect observers when done.

```typescript
const observer = new MutationObserver((mutations) => { /* ... */ });
observer.observe(element, { childList: true });

// Cleanup
observer.disconnect();
```

### 4. createRoot without Disposal (SolidJS)

When using `createRoot`, always store and call the dispose function.

```typescript
// GOOD
let dispose: (() => void) | null = null;

function init() {
  dispose = createRoot((disposeFn) => {
    // Component logic
    return disposeFn;
  });
}

function cleanup() {
  if (dispose) {
    dispose();
    dispose = null;
  }
}
```

### 5. DOM References

Avoid storing long-lived references to DOM elements that may be removed.

```typescript
// BAD - May prevent garbage collection
class MyComponent {
  private element = document.getElementById('my-element');
  
  doSomething() {
    this.element?.style.color = 'red';
  }
}

// GOOD - Query when needed
class MyComponent {
  doSomething() {
    const element = document.getElementById('my-element');
    element?.style.color = 'red';
  }
}
```

## Best Practices

### 1. Use Framework Lifecycle Methods

- **SolidJS**: Use `onCleanup` for cleanup logic
- **React**: Return cleanup function from `useEffect`
- **Angular**: Implement `OnDestroy` and use `ngOnDestroy`
- **Vue**: Use `onUnmounted` or `beforeUnmount`

### 2. Implement Cleanup Functions

For any initialization function, provide a corresponding cleanup function:

```typescript
export function init() {
  // Setup code
  setupEventListeners();
  startTimers();
}

export function cleanup() {
  // Cleanup code
  removeEventListeners();
  clearTimers();
}
```

### 3. Test for Memory Leaks

Use browser DevTools to profile memory usage:

1. Open Chrome DevTools > Memory tab
2. Take a heap snapshot before action
3. Perform the action (e.g., mount/unmount component)
4. Take another heap snapshot
5. Compare snapshots to identify retained objects

### 4. Use WeakMap/WeakSet for Caches

When caching DOM elements or other objects, use WeakMap/WeakSet to allow garbage collection:

```typescript
// GOOD - Allows garbage collection
const elementCache = new WeakMap<Element, CachedData>();

// BAD - Prevents garbage collection
const elementCache = new Map<Element, CachedData>();
```

### 5. Document Lifecycle Requirements

Add comments to indicate cleanup requirements:

```typescript
/**
 * Initialize download bar
 * @note Call cleanup() when download bar is no longer needed
 */
export function init() { /* ... */ }

/**
 * Cleanup download bar resources
 * @note Removes event listeners and disposes reactive roots
 */
export function cleanup() { /* ... */ }
```

## Components with Proper Cleanup

The following components have been verified to have proper cleanup:

### ✅ Background Component (browser-features/pages-newtab/src/components/Background/index.tsx)

- Uses `useEffect` with proper cleanup for slideshow intervals
- Clears both `setInterval` and `setTimeout` in cleanup function

### ✅ Clock Component (browser-features/pages-newtab/src/components/Clock/index.tsx)

- Uses `useEffect` with proper cleanup for time update interval
- Calls `clearInterval` in cleanup function

### ✅ DOM Layout Manager (browser-features/chrome/common/ui-custom/layout/dom-manipulator.ts)

- Properly manages MutationObserver lifecycle with disconnect
- Clears intervals with proper guards
- Removes event listeners when switching targets

## Testing Memory Leaks

### Manual Testing Steps

1. Open the browser with DevTools
2. Navigate to the feature being tested
3. Take a memory snapshot
4. Interact with the feature (open/close, mount/unmount)
5. Force garbage collection (DevTools > Memory > Collect garbage icon)
6. Take another memory snapshot
7. Compare snapshots - look for unexpected retained objects

### Automated Testing

Consider adding memory leak detection to CI/CD:

```typescript
// Example test structure
test('Component cleanup', () => {
  const { unmount } = render(<MyComponent />);
  
  // Store initial state
  const initialListeners = getEventListenerCount();
  
  // Cleanup
  unmount();
  
  // Verify cleanup
  expect(getEventListenerCount()).toBe(initialListeners);
});
```

## References

- [MDN: Memory Management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)
- [Chrome DevTools Memory Profiling](https://developer.chrome.com/docs/devtools/memory-problems/)
- [SolidJS Lifecycle](https://www.solidjs.com/tutorial/lifecycles_oncleanup)
- [React useEffect Cleanup](https://react.dev/learn/synchronizing-with-effects#step-3-add-cleanup-if-needed)

## Conclusion

Memory leaks can significantly impact browser performance and user experience. By following the patterns and best practices outlined in this document, developers can ensure that Floorp components properly manage their resources and avoid memory leaks.

When in doubt:
- **Always clean up what you set up**
- **Test memory usage during development**
- **Document lifecycle requirements**
- **Use framework lifecycle methods**
