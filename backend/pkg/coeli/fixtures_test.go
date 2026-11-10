//go:build postgres

package coeli

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"strings"
	"testing"
	"time"
)

func liveStore(t *testing.T) (Store, context.Context) {
	t.Helper()
	dsn := os.Getenv("COELI_TEST_DSN")
	if dsn == "" {
		t.Fatal("COELI_TEST_DSN is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	schema := fmt.Sprintf("coeli_test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Error(err)
		}
	})
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err = pool.Exec(ctx, "CREATE TABLE users(id BIGINT PRIMARY KEY); INSERT INTO users(id) VALUES(1),(2)"); err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile("../../migrations/sql/20261109_120000_coeli.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, strings.Split(string(migration), "-- +goose Down")[0]); err != nil {
		t.Fatal(err)
	}
	return Store{Pool: pool}, ctx
}
