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
