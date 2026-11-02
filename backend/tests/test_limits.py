from app.core import limits


def test_rate_limiter_prunes_expired_client_keys(monkeypatch) -> None:
    limiter = limits.InMemoryRateLimiter()
    now = 100.0

    monkeypatch.setattr(limits.time, "monotonic", lambda: now)
    assert limiter.allow("expired-client", limit=1, window_seconds=60)

    now += 61
    assert limiter.allow("active-client", limit=1, window_seconds=60)

    assert set(limiter._hits) == {"active-client"}


def test_rate_limiter_keeps_active_client_keys_during_pruning(monkeypatch) -> None:
    limiter = limits.InMemoryRateLimiter()
    now = 100.0

    monkeypatch.setattr(limits.time, "monotonic", lambda: now)
    assert limiter.allow("first-client", limit=2, window_seconds=60)

    now += 30
    assert limiter.allow("second-client", limit=2, window_seconds=60)

    now += 31
    assert limiter.allow("third-client", limit=2, window_seconds=60)

    assert set(limiter._hits) == {"second-client", "third-client"}


def test_aggregate_budget_rounds_attempts_and_expires(monkeypatch) -> None:
    budget = limits.InProcessAudioBudget()
    now = 100.0
    monkeypatch.setattr(limits.time, "monotonic", lambda: now)
    assert budget.reserve(0.25, limit=2, window_seconds=60)
    assert budget.reserve(0.5, limit=2, window_seconds=60)
    assert not budget.reserve(0.25, limit=2, window_seconds=60)
    now += 60
    assert budget.reserve(2, limit=2, window_seconds=60)


def test_aggregate_budget_is_atomic_across_concurrent_callers() -> None:
    from concurrent.futures import ThreadPoolExecutor
    budget = limits.InProcessAudioBudget()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: budget.reserve(1, limit=10, window_seconds=60), range(100)))
    assert sum(results) == 10


def test_aggregate_budget_rejects_invalid_durations() -> None:
    budget = limits.InProcessAudioBudget()
    for seconds in [0, -1, float("nan"), float("inf")]:
        assert not budget.reserve(seconds, limit=10, window_seconds=60)
