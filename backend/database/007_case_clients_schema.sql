
BEGIN;

-- ============================================
-- EVIDENCEVAULT: CLIENT-CASE RELATIONSHIP
-- Migration: 007_case_clients_schema.sql
-- ============================================

CREATE TABLE IF NOT EXISTS case_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    case_id UUID NOT NULL
        REFERENCES cases(id) ON DELETE RESTRICT,

    client_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    linked_by UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT case_clients_status_check
    CHECK (
        status IN ('active', 'suspended', 'removed')
    ),

    CONSTRAINT case_clients_unique
    UNIQUE (case_id, client_id)
);

-- Find all cases belonging to a Client
CREATE INDEX IF NOT EXISTS idx_case_clients_client
ON case_clients(client_id, status, linked_at DESC);

-- Find all Clients associated with a case
CREATE INDEX IF NOT EXISTS idx_case_clients_case
ON case_clients(case_id, status);

-- Track who linked Clients to cases
CREATE INDEX IF NOT EXISTS idx_case_clients_linked_by
ON case_clients(linked_by, linked_at DESC);

COMMIT;
