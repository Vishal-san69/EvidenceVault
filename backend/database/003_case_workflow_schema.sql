
BEGIN;

-- ============================================
-- EVIDENCEVAULT: CASE REQUEST MANAGEMENT
-- Migration: 003_case_workflow_schema.sql
-- ============================================

CREATE TABLE IF NOT EXISTS case_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Client who submits the request
    client_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    -- Lawyer who receives the request
    professional_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    -- Information provided by the client
    requested_case_title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,

    -- Request lifecycle
    status VARCHAR(30) NOT NULL DEFAULT 'pending',

    -- Response from the assigned professional
    professional_response TEXT,

    -- Formal case created after the request is accepted
    converted_case_id UUID
        REFERENCES cases(id) ON DELETE SET NULL,

    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT case_requests_status_check
    CHECK (
        status IN (
            'pending',
            'under_review',
            'needs_information',
            'accepted',
            'rejected',
            'converted_to_case',
            'withdrawn'
        )
    ),

    CONSTRAINT case_requests_different_users_check
    CHECK (client_id <> professional_id)
);

-- Find requests received by a professional
CREATE INDEX IF NOT EXISTS idx_case_requests_professional
ON case_requests(professional_id, status, created_at DESC);

-- Find requests submitted by a client
CREATE INDEX IF NOT EXISTS idx_case_requests_client
ON case_requests(client_id, created_at DESC);

-- Find requests associated with a formal case
CREATE INDEX IF NOT EXISTS idx_case_requests_converted_case
ON case_requests(converted_case_id);

-- Prevent duplicate active requests from the same client
-- to the same professional.
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_requests_active_unique
ON case_requests(client_id, professional_id)
WHERE status IN (
    'pending',
    'under_review',
    'needs_information',
    'accepted'
);

COMMIT;
