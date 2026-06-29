import { describe, it, expect } from "vitest";
import { normalizeCatalog, groupByProvider } from "./models";

describe("normalizeCatalog", () => {
  it("flattens provider + string models", () => {
    const out = normalizeCatalog([
      { provider: "OpenAI-Compat", models: ["gpt-4o", "gpt-4o-mini"] },
    ]);
    expect(out).toEqual([
      { provider: "openai-compat", model: "gpt-4o" },
      { provider: "openai-compat", model: "gpt-4o-mini" },
    ]);
  });

  it("lowercases provider and dedupes case-insensitively", () => {
    const out = normalizeCatalog([
      { provider: "Codex", models: ["GPT-5"] },
      { provider: "codex", models: ["gpt-5"] },
    ]);
    expect(out).toEqual([{ provider: "codex", model: "GPT-5" }]);
  });

  it("handles array-of-objects with model/id/name fields", () => {
    const out = normalizeCatalog([
      {
        provider: "claude",
        models: [
          { model: "claude-sonnet-4" },
          { id: "claude-opus-4" },
          { name: "claude-haiku" },
        ],
      },
    ]);
    // same provider -> sorted case-insensitively
    expect(out.map((o) => o.model)).toEqual([
      "claude-haiku",
      "claude-opus-4",
      "claude-sonnet-4",
    ]);
  });

  it("handles object-map models", () => {
    const out = normalizeCatalog([
      { provider: "gemini", models: { "gemini-2.5": {}, "gemini-pro": {} } },
    ]);
    expect(out.map((o) => o.model).sort()).toEqual([
      "gemini-2.5",
      "gemini-pro",
    ]);
  });

  it("skips empty providers and models", () => {
    const out = normalizeCatalog([
      { provider: "", models: ["x"] },
      { provider: "p", models: [""] },
      { provider: "p", models: ["ok"] },
    ]);
    expect(out).toEqual([{ provider: "p", model: "ok" }]);
  });

  it("skips entries without models", () => {
    const out = normalizeCatalog([{ provider: "p" }, { provider: "p", models: null }]);
    expect(out).toEqual([]);
  });

  it("sorts by provider then model", () => {
    const out = normalizeCatalog([
      { provider: "z", models: ["b", "a"] },
      { provider: "a", models: ["c"] },
    ]);
    expect(out.map((o) => o.provider + "/" + o.model)).toEqual([
      "a/c",
      "z/a",
      "z/b",
    ]);
  });
});

describe("groupByProvider", () => {
  it("groups models under each provider", () => {
    const groups = groupByProvider([
      { provider: "codex", model: "gpt-5" },
      { provider: "codex", model: "gpt-5-codex" },
      { provider: "claude", model: "claude-sonnet-4" },
    ]);
    expect(groups).toEqual([
      { provider: "claude", models: ["claude-sonnet-4"] },
      { provider: "codex", models: ["gpt-5", "gpt-5-codex"] },
    ]);
  });
});
