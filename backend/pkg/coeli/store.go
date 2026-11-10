package coeli

import (
	"bytes"
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ Pool *pgxpool.Pool }

func (db Store) Read(ctx context.Context, owner int64) (*State, error) {
	if owner <= 0 {
		return nil, ErrDenied
	}
	var data []byte
	err := db.Pool.QueryRow(ctx, "SELECT document FROM coeli_states WHERE owner_id=$1", owner).Scan(&data)
	if err != nil {
		return nil, err
	}
	return decodeState(data)
}
func (db Store) Update(ctx context.Context, owner int64, actor, action, object string, fn func(*State) error) error {
	if owner <= 0 {
		return ErrDenied
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	initial, _ := encodeState(NewState())
	if _, err = tx.Exec(ctx, "INSERT INTO coeli_states(owner_id,document) VALUES($1,$2) ON CONFLICT DO NOTHING", owner, initial); err != nil {
		return err
	}
	var data []byte
	if err = tx.QueryRow(ctx, "SELECT document FROM coeli_states WHERE owner_id=$1 FOR UPDATE", owner).Scan(&data); err != nil {
		return err
	}
	s, err := decodeState(data)
	if err != nil {
		return err
	}
	before, err := encodeState(s)
	if err != nil {
		return err
	}
	if len(actor) == 48 {
		w := s.Workers[actor]
		if w == nil || w.Revoked {
			return ErrDenied
		}
	}
	if err = fn(s); err != nil {
		return err
	}
	data, err = encodeState(s)
	if err != nil {
		return err
	}
	if bytes.Equal(before, data) {
		return tx.Commit(ctx)
	}
	if _, err = tx.Exec(ctx, "UPDATE coeli_states SET document=$2,revision=revision+1,updated_at=now() WHERE owner_id=$1", owner, data); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO coeli_audit(owner_id,actor,action,object_id,document_sha256) VALUES($1,$2,$3,$4,$5)", owner, actor, action, object, digest(data)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (db Store) Owners(ctx context.Context) ([]int64, error) {
	rows, err := db.Pool.Query(ctx, "SELECT owner_id FROM coeli_states ORDER BY owner_id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var owners []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		owners = append(owners, id)
	}
	return owners, rows.Err()
}
func userActor(id int64) string { return "user:" + strconv.FormatInt(id, 10) }
