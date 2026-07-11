package docker

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/docker/docker/api/types/container"
)

func okStat(_ context.Context, name string) (container.PathStat, error) {
	return container.PathStat{Name: name, Size: int64(len(name))}, nil
}

func TestStatContainerEntries_AllSucceedInInputOrder(t *testing.T) {
	names := []string{"c", "a", "b", "z", "m"}
	stats, err := statContainerEntries(context.Background(), names, 20, okStat)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(stats) != len(names) {
		t.Fatalf("got %d stats, want %d", len(stats), len(names))
	}
	for i, name := range names {
		if stats[i].Name != name {
			t.Fatalf("result order not preserved at %d: got %q want %q", i, stats[i].Name, name)
		}
	}
}

func TestStatContainerEntries_Empty(t *testing.T) {
	stats, err := statContainerEntries(context.Background(), nil, 20, okStat)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(stats) != 0 {
		t.Fatalf("got %d stats, want 0", len(stats))
	}
}

// With several failing entries, the surfaced error is deterministically the
// lowest-index failure regardless of completion order, so it stays reproducible.
func TestStatContainerEntries_LowestIndexErrorSurfaces(t *testing.T) {
	names := []string{"e0", "e1", "e2", "e3", "e4"}
	fail := map[string]bool{"e3": true, "e1": true} // lowest failing index is 1
	// e3 fails fast, e1 fails slowly: completion order would surface e3, but
	// the input-order rule must surface e1.
	delay := map[string]time.Duration{"e1": 20 * time.Millisecond}
	statFn := func(_ context.Context, name string) (container.PathStat, error) {
		time.Sleep(delay[name])
		if fail[name] {
			return container.PathStat{}, fmt.Errorf("boom %s", name)
		}
		return container.PathStat{Name: name}, nil
	}
	stats, err := statContainerEntries(context.Background(), names, 20, statFn)
	if err == nil {
		t.Fatal("expected an error")
	}
	if stats != nil {
		t.Fatalf("expected nil stats on error, got %v", stats)
	}
	if !strings.Contains(err.Error(), "entry 'e1'") {
		t.Fatalf("want lowest-index entry 'e1' in error, got %q", err.Error())
	}
}

// The pool never runs more than `workers` stat calls at once — the load-bearing
// bound against the Docker daemon (which caps idle but not active connections).
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

	if _, err := statContainerEntries(context.Background(), names, workers, statFn); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := max.Load(); got > workers {
		t.Fatalf("concurrency exceeded limit: peak=%d, limit=%d", got, workers)
	} else if got < 2 {
		t.Fatalf("statFn never overlapped (peak=%d) — test is not exercising concurrency", got)
	}
}

// The caller's context reaches each stat call, so a cancellation aborts them.
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
	if _, err := statContainerEntries(ctx, names, 20, statFn); err == nil {
		t.Fatal("expected an error once the context is cancelled")
	}
}

// Property-based: over randomized shapes, success yields input-order stats and
// any failure yields exactly the lowest-index entry's error. Fixed seed.
func TestStatContainerEntries_PropertyFuzz(t *testing.T) {
	rng := rand.New(rand.NewSource(2))
	for iter := 0; iter < 300; iter++ {
		n := rng.Intn(50)
		names := make([]string, n)
		for i := range names {
			names[i] = fmt.Sprintf("it%d-e%d", iter, i)
		}
		fail := make(map[string]bool, n)
		delay := make(map[string]time.Duration, n)
		lowest := -1
		for i, nm := range names {
			if rng.Intn(3) == 0 {
				fail[nm] = true
				if lowest == -1 {
					lowest = i
				}
			}
			delay[nm] = time.Duration(rng.Intn(2)) * time.Millisecond
		}
		statFn := func(_ context.Context, name string) (container.PathStat, error) {
			time.Sleep(delay[name])
			if fail[name] {
				return container.PathStat{}, fmt.Errorf("boom %s", name)
			}
			return container.PathStat{Name: name, Size: int64(len(name))}, nil
		}

		stats, err := statContainerEntries(context.Background(), names, 20, statFn)
		if lowest >= 0 {
			if err == nil {
				t.Fatalf("iter %d: expected error for lowest-index failure %q", iter, names[lowest])
			}
			if want := fmt.Sprintf("entry '%s'", names[lowest]); !strings.Contains(err.Error(), want) {
				t.Fatalf("iter %d: want %q in error, got %q", iter, want, err.Error())
			}
			if stats != nil {
				t.Fatalf("iter %d: want nil stats on error", iter)
			}
			continue
		}
		if err != nil {
			t.Fatalf("iter %d: unexpected error: %v", iter, err)
		}
		for i, name := range names {
			if stats[i].Name != name {
				t.Fatalf("iter %d: order not preserved at %d", iter, i)
			}
		}
	}
}
