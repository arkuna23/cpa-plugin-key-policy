import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

// Mark the test env so React's act() warning is silenced under jsdom.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import type { ModelRule } from "../types";

// Regression: on mount, before the model catalog finishes loading, ModelPicker
// must NOT call onChange with an empty rules array. Doing so wipes pre-filled
// parent state (e.g. per-alias pricing on the edit page). We mock fetchCatalog
// to resolve on a microtask so we can observe the empty-groups phase.

vi.mock("../api/models", () => ({
  fetchCatalog: vi.fn(),
  groupByProvider: (catalog: { provider: string; model: string }[]) => {
    const map = new Map<string, string[]>();
    for (const c of catalog) {
      const arr = map.get(c.provider) ?? [];
      arr.push(c.model);
      map.set(c.provider, arr);
    }
    return Array.from(map.entries())
      .map(([provider, models]) => ({ provider, models }))
      .sort((a, b) => a.provider.localeCompare(b.provider));
  },
}));

// Import AFTER the mock so ModelPicker picks up the mocked fetchCatalog.
import ModelPicker from "./ModelPicker";
import { fetchCatalog } from "../api/models";

const initial: ModelRule[] = [
  { alias: "grok-composer-2.5-fast", provider: "xai", target_model: "grok-composer-2.5-fast",
    input_price_per_million: 1, output_price_per_million: 2 },
];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("ModelPicker empty-catalog guard", () => {
  it("does not emit before the catalog loads (preserves edit prefill)", async () => {
    let resolveCatalog: (v: { provider: string; model: string }[]) => void = () => {};
    (fetchCatalog as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((res) => (resolveCatalog = res)),
    );

    const calls: ModelRule[][] = [];
    const onChange = (rules: ModelRule[]) => calls.push([...rules]);

    await act(async () => {
      root = createRoot(container);
      root.render(<ModelPicker initial={initial} onChange={onChange} />);
      // Let the async fetchCatalog be initiated; do NOT resolve it yet.
      await tick();
    });

    // While the catalog is still loading (groups empty), NO emit happened.
    // This is the bug fix: previously it emitted [] here and wiped the parent's
    // pre-filled pricing rows.
    expect(calls.length).toBe(0);

    // Now the catalog resolves with the selected model present.
    await act(async () => {
      resolveCatalog([{ provider: "xai", model: "grok-composer-2.5-fast" }]);
      await tick();
    });

    // After load, it emits exactly the selected rule (alias = model name).
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual([
      { alias: "grok-composer-2.5-fast", provider: "xai", target_model: "grok-composer-2.5-fast" },
    ]);
  });
});
