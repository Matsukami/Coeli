//go:build postgres

package coeli

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestStore_Update_RestartConcurrentClaimsAndOwnerIsolation(t *testing.T) {
	store, ctx := liveStore(t)
	pool := store.Pool
	now := time.Now().UTC()
	var run *Run
	if err := store.Update(ctx, 1, "test", "create", "", func(s *State) error {
		var err error
		run, err = createRun(s, "attack", "restart", "external", DefaultPolicy("laboratory"), now)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.Update(ctx, 2, "test", "create", "", func(*State) error { return nil }); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	claims := 0
	var claimed Task
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			err := store.Update(ctx, 1, fmt.Sprint(i), "claim", "", func(s *State) error {
				task, err := claim(s, fmt.Sprint(i), []string{"infrastructure.v1"}, "laboratory", "external", now)
				if task != nil {
					mu.Lock()
					claims++
					claimed = *task
					mu.Unlock()
				}
				return err
			})
			if err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if claims != 1 {
		t.Fatalf("concurrent claims: %d", claims)
	}
	restored := Store{Pool: pool}
	state, err := restored.Read(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if state.Tasks[claimed.ID].Lease != claimed.Lease {
		t.Fatal("lease not persisted")
	}
	other, err := restored.Read(ctx, 2)
	if err != nil {
		t.Fatal(err)
	}
	if other.Runs[run.ID] != nil {
		t.Fatal("owner leak")
	}
	if _, err = pool.Exec(ctx, "DELETE FROM coeli_audit WHERE owner_id=1"); err == nil {
		t.Fatal("audit deletion was accepted")
	}
	if err = store.Update(ctx, 1, "test", "recover", "", func(s *State) error {
		recoverTasks(s, now.Add(46*time.Second))
		if s.Tasks[claimed.ID].Status != "queued" {
			t.Fatal("not recovered")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
