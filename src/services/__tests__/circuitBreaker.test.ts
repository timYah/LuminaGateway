import { describe, expect, it, vi, afterEach } from "vitest";
import { CircuitBreaker } from "../circuitBreaker";

afterEach(() => {
  vi.useRealTimers();
});

describe("CircuitBreaker", () => {
  it("opens and reports open state", () => {
    const breaker = new CircuitBreaker();
    breaker.open(1, 1000, "gpt-4o");
    expect(breaker.isOpen(1)).toBe(true);
    expect(breaker.isOpen(1, "gpt-4o")).toBe(true);
    expect(breaker.isOpen(1, "gpt-4.1")).toBe(false);
  });

  it("resets open state", () => {
    const breaker = new CircuitBreaker();
    breaker.open(1, 1000, "gpt-4o");
    breaker.reset(1, "gpt-4o");
    expect(breaker.isOpen(1)).toBe(false);
  });

  it("auto-expires after cooldown", () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker();
    breaker.open(1, 1000, "gpt-4o");
    expect(breaker.isOpen(1, "gpt-4o")).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(breaker.isOpen(1, "gpt-4o")).toBe(false);
  });
});
