package docker

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"sync/atomic"
	"testing"
	"time"

	"github.com/docker/docker/api/types/container"
)

func okStat(_ context.Context, name string) (container.PathStat, error) {
	return container.PathStat{Name: name, Size: int64(len(name))}, nil
}

func failNames(failures []statFailure) map[string]bool {
	m := make(map[string]bool, len(failures))
	for _, f := range failures {
		m[f.name] = true
	}
	return m
}

func TestStatContainerEntries_AllSucceed(t *testing.T) {
	names := []string{"c", "a", "b", "z", "m"}
	stats, failures := statContainerEntries(context.Background(), names, 20, okStat)
	if len(failures) != 0 {
		t.Fatalf("unexpected failures: %v", failures)
	}
	if len(stats) != len(names) {
		t.Fatalf("got %d stats, want %d", len(stats), len(names))
	}
}

func TestStatContainerEntries_Empty(t *testing.T) {
	stats, failures := statContainerEntries(context.Background(), nil, 20, okStat)
	if len(stats) != 0 || len(failures) != 0 {
		t.Fatalf("got %d stats / %d failures, want 0/0", len(stats), len(failures))
	}
}

// A per-entry stat error must NOT abort the batch: the readable entries are
// returned and the failing ones come back as failures — partial success.
func TestStatContainerEntries_PartialSuccessNotAborting(t *testing.T) {
	names := []string{"e0", "e1", "e2", "e3", "e4"}
	fail := map[string]bool{"e1": true, "e3": true}
	statFn := func(_ context.Context, name string) (container.PathStat, error) {
		if fail[name] {
			return container.PathStat{}, fmt.Errorf("boom %s", name)
		}
		return container.PathStat{Name: name}, nil
	}
	stats, failures := statContainerEntries(context.Background(), names, 20, statFn)

	fn := failNames(failures)
	if len(fn) != 2 || !fn["e1"] || !fn["e3"] {
		t.Fatalf("want failures {e1,e3}, got %v", fn)
	}
	wantOK := []string{"e0", "e2", "e4"} // successes, preserved in input order
	if len(stats) != len(wantOK) {
		t.Fatalf("want %d readable entries, got %d", len(wantOK), len(stats))
	}
	for i, s := range stats {
		if s.Name != wantOK[i] {
			t.Fatalf("success order at %d: got %q want %q", i, s.Name, wantOK[i])
		}
	}
}

// The pool never runs more than `workers` stat calls at once — the load-bearing
// bound against the Docker daemon.
func TestStatContainerEntries_RespectsConcurrencyLimit(t *testing.T) {
	const workers = 5
	names := make([]string, 100)
	for i := range names {
		names[i] = fmt.Sprintf("e%d", i)
	}
	var cur, max atomic.Int64
	statFn := func(_ context.Context, name string) (container.PathStat, error) {
		c := cur.Add(1)
		for {
			m := max.Load()
			if c <= m || max.CompareAndSwap(m, c) {
				break
			}
		}
		time.Sleep(2 * time.Millisecond)
		cur.Add(-1)
		return container.PathStat{Name: name}, nil
	}
	if _, failures := statContainerEntries(context.Background(), names, workers, statFn); len(failures) != 0 {
		t.Fatalf("unexpected failures: %v", failures)
	}
	if got := max.Load(); got > workers {
		t.Fatalf("concurrency exceeded limit: peak=%d, limit=%d", got, workers)
	} else if got < 2 {
		t.Fatalf("statFn never overlapped (peak=%d) — test is not exercising concurrency", got)
	}
}

// The caller's context reaches each stat call; a cancellation turns entries into
// failures rather than blanking the whole batch.
func TestStatContainerEntries_ContextPropagates(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	names := []string{"a", "b", "c", "d", "e"}
	var once atomic.Bool
	statFn := func(ctx context.Context, name string) (container.PathStat, error) {
		if once.CompareAndSwap(false, true) {
			cancel()
		}
		select {
		case <-ctx.Done():
			return container.PathStat{}, ctx.Err()
		case <-time.After(2 * time.Second):
			return container.PathStat{Name: name}, nil
		}
	}
	_, failures := statContainerEntries(ctx, names, 20, statFn)
	if len(failures) == 0 {
		t.Fatal("expected failures once the context is cancelled")
	}
	for _, f := range failures {
		if !errors.Is(f.err, context.Canceled) {
			t.Fatalf("failure %q: want context.Canceled, got %v", f.name, f.err)
		}
	}
}

// A non-positive worker count must fall back to a safe bound rather than
// deadlock (errgroup SetLimit(0)) or run unbounded (SetLimit(<0)).
func TestStatContainerEntries_NonPositiveWorkersFallBack(t *testing.T) {
	names := make([]string, 50)
	for i := range names {
		names[i] = fmt.Sprintf("e%d", i)
	}
	for _, workers := range []int{0, -1} {
		t.Run(fmt.Sprintf("workers=%d", workers), func(t *testing.T) {
			done := make(chan int, 1)
			go func() {
				stats, _ := statContainerEntries(context.Background(), names, workers, okStat)
				done <- len(stats)
			}()
			select {
			case n := <-done:
				if n != len(names) {
					t.Fatalf("got %d stats, want %d", n, len(names))
				}
			case <-time.After(3 * time.Second):
				t.Fatal("statContainerEntries hung with a non-positive worker count")
			}
		})
	}
}

// Property-based: over randomized shapes nothing is lost — every failing name
// lands in failures, every other name yields a stat, and stats+failures == n.
func TestStatContainerEntries_PropertyFuzz(t *testing.T) {
	rng := rand.New(rand.NewSource(2))
	for iter := 0; iter < 300; iter++ {
		n := rng.Intn(50)
		names := make([]string, n)
		wantFail := make(map[string]bool, n)
		for i := range names {
			names[i] = fmt.Sprintf("it%d-e%d", iter, i)
			if rng.Intn(3) == 0 {
				wantFail[names[i]] = true
			}
		}
		statFn := func(_ context.Context, name string) (container.PathStat, error) {
			if wantFail[name] {
				return container.PathStat{}, fmt.Errorf("boom %s", name)
			}
			return container.PathStat{Name: name}, nil
		}
		stats, failures := statContainerEntries(context.Background(), names, 20, statFn)

		if len(stats)+len(failures) != n {
			t.Fatalf("iter %d: lost data — %d stats + %d failures != %d names", iter, len(stats), len(failures), n)
		}
		gotFail := failNames(failures)
		if len(gotFail) != len(wantFail) {
			t.Fatalf("iter %d: want %d failures, got %d", iter, len(wantFail), len(gotFail))
		}
		for nm := range wantFail {
			if !gotFail[nm] {
				t.Fatalf("iter %d: missing failure for %q", iter, nm)
			}
		}
		for _, s := range stats {
			if wantFail[s.Name] {
				t.Fatalf("iter %d: %q failed but appears in stats", iter, s.Name)
			}
		}
	}
}
