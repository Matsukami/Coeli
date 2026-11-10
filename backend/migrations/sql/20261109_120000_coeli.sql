-- +goose Up
-- +goose StatementBegin
CREATE TABLE coeli_states (
    owner_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 0,
    document JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE coeli_audit (
    id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    object_id TEXT NOT NULL,
    document_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coeli_audit_owner_idx ON coeli_audit(owner_id, id);
CREATE FUNCTION coeli_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Coeli audit is append-only';
END;
$$;
CREATE TRIGGER coeli_audit_guard BEFORE UPDATE OR DELETE ON coeli_audit FOR EACH ROW EXECUTE FUNCTION coeli_audit_immutable();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER coeli_audit_guard ON coeli_audit;
DROP FUNCTION coeli_audit_immutable();
DROP TABLE coeli_audit;
DROP TABLE coeli_states;
-- +goose StatementEnd
