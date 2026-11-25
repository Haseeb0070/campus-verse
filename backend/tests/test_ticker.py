"""The API's own timer runs each job once per round, however many workers try."""

from apps.core import ticker


def test_only_one_worker_runs_each_round(db, monkeypatch):
    calls = []
    monkeypatch.setattr(ticker, "_frequent", lambda: calls.append("minute") or {"reminders": 0})
    monkeypatch.setattr(ticker, "_half_hourly", lambda: calls.append("half") or {"notices": 0})
    first = ticker.tick()
    second = ticker.tick()  # another worker in the same minute
    assert first == {"reminders": 0, "notices": 0}
    assert second == {}
    assert calls == ["minute", "half"]


def test_a_failing_job_does_not_stop_the_other(db, monkeypatch):
    def boom():
        raise RuntimeError("down")

    monkeypatch.setattr(ticker, "_frequent", boom)
    monkeypatch.setattr(ticker, "_half_hourly", lambda: {"notices": 1})
    assert ticker.tick() == {"notices": 1}


def test_the_real_jobs_run(db):
    out = ticker.tick()
    assert set(out) == {"reminders", "requests_lapsed", "notices_published", "notifications"}
