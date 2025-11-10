// SPDX-License-Identifier: MPL-2.0

import { createSignal, onCleanup } from "solid-js";

export function Counter() {
  const [count, setCount] = createSignal(0);
  const intervalId = setInterval(() => setCount(count() + 1), 1000);
  onCleanup(() => clearInterval(intervalId));
  (document?.getElementById("aaa") as XULElement).style.display;
  return (
    <div
      style="font-size:30px"
      onClick={() => {
        window.alert("click!");
      }}
    >
      Count aa: {count()}
    </div>
  );
}
