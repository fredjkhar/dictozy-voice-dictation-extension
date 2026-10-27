from collections import defaultdict, deque
from contextlib import asynccontextmanager
import threading
import time
import math
from typing import AsyncIterator


class LimitExceeded(Exception):
    """Raised when an in-process launch guard rejects a request."""


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_prune_at = 0.0
        self._lock = threading.Lock()

    def _prune_stale_buckets(self, cutoff: float) -> None:
        stale_keys = [key for key, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
        for key in stale_keys:
            del self._hits[key]

    def allow(self, key: str, *, limit: int, window_seconds: int) -> bool:
        if limit <= 0:
            return True

        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            if now - self._last_prune_at >= window_seconds:
                self._prune_stale_buckets(cutoff)
                self._last_prune_at = now

            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()

            if len(hits) >= limit:
                return False

            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._last_prune_at = 0.0


class InProcessConcurrencyLimiter:
    def __init__(self) -> None:
        self._in_flight = 0
        self._lock = threading.Lock()

    @asynccontextmanager
    async def acquire(self, *, limit: int) -> AsyncIterator[None]:
        if limit <= 0:
            yield
            return

        with self._lock:
            if self._in_flight >= limit:
                raise LimitExceeded("concurrency limit exceeded")
            self._in_flight += 1

        try:
            yield
        finally:
            with self._lock:
                self._in_flight = max(0, self._in_flight - 1)

    def reset(self) -> None:
        with self._lock:
            self._in_flight = 0


class InProcessAudioBudget:
    """Atomic rolling allowance across clients in one worker, reset on restart.

    Reserve before calling the provider; failed/cancelled attempts are not refunded.
    Whole-second rounding also bounds the number of retained accounting entries.
    No client identifiers, audio or transcript data are retained here.
    """

    def __init__(self) -> None:
        self._reservations: deque[tuple[float, int]] = deque()
        self._used = 0
        self._lock = threading.Lock()

    def reserve(self, seconds: float, *, limit: int, window_seconds: int) -> bool:
        if not math.isfinite(seconds) or seconds <= 0 or limit <= 0 or window_seconds <= 0:
            return False
        cost = math.ceil(seconds)
        with self._lock:
            now = time.monotonic()
            while self._reservations and self._reservations[0][0] <= now - window_seconds:
                self._used -= self._reservations.popleft()[1]
            if self._used + cost > limit:
                return False
            self._reservations.append((now, cost))
            self._used += cost
            return True

    def reset(self) -> None:
        with self._lock:
            self._reservations.clear()
            self._used = 0
