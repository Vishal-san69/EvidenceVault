
BEGIN;

-- ============================================
-- EVIDENCEVAULT: DOCUMENT REQUEST MANAGEMENT
-- Migration: 008_document_requests_schema.sql
-- ============================================

CREATE TABLE IF NOT EXISTS document_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    case_id UUID NOT NULL
        REFERENCES cases(id) ON DELETE RESTRICT,

    requested_by UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    client_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    document_id UUID
        REFERENCES documents(id) ON DELETE SET NULL,

    title VARCHAR(200) NOT NULL,

    description TEXT NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'pending',

    professional_response TEXT,

    due_date DATE,

    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    submitted_at TIMESTAMPTZ,

    reviewed_at TIMESTAMPTZ,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT document_requests_status_check
    CHECK (
        status IN (
            'pending',
            'submitted',
            'approved',
            'rejected',
            'resubmission_required',
            'cancelled'
        )
    ),

    CONSTRAINT document_requests_different_users_check
    CHECK (requested_by <> client_id),

    CONSTRAINT document_requests_submission_check
    CHECK (
        (status = 'pending' AND submitted_at IS NULL)
        OR
        (status <> 'pending' AND status <> 'cancelled'
            AND submitted_at IS NOT NULL)
        OR
        status = 'cancelled'
    )
);

-- Requests received by a Client
CREATE INDEX IF NOT EXISTS idx_document_requests_client
ON document_requests(client_id, status, requested_at DESC);

-- Requests created by a professional
CREATE INDEX IF NOT EXISTS idx_document_requests_requester
ON document_requests(requested_by, requested_at DESC);

-- All document requests associated with a case
CREATE INDEX IF NOT EXISTS idx_document_requests_case
ON document_requests(case_id, status);

-- Locate requests associated with uploaded documents
CREATE INDEX IF NOT EXISTS idx_document_requests_document
ON document_requests(document_id);

COMMIT;
