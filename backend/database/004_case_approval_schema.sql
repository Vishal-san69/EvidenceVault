
BEGIN;

-- ============================================
-- EVIDENCEVAULT: CASE APPROVAL WORKFLOW
-- Migration: 004_case_approval_schema.sql
-- ============================================

CREATE TABLE IF NOT EXISTS case_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    case_id UUID NOT NULL
        REFERENCES cases(id) ON DELETE RESTRICT,

    -- Admin responsible for the decision
    admin_id UUID
        REFERENCES users(id) ON DELETE RESTRICT,

    status VARCHAR(30) NOT NULL DEFAULT 'pending',

    comments TEXT,

    reviewed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT case_approvals_status_check
    CHECK (
        status IN (
            'pending',
            'approved',
            'rejected',
            'changes_requested'
        )
    ),

    CONSTRAINT case_approvals_review_consistency_check
    CHECK (
        (status = 'pending' AND reviewed_at IS NULL AND admin_id IS NULL)
        OR
        (status <> 'pending' AND reviewed_at IS NOT NULL AND admin_id IS NOT NULL)
    )
);

-- Approval history for each case
CREATE INDEX IF NOT EXISTS idx_case_approvals_case
ON case_approvals(case_id, created_at DESC);

-- Find pending approvals for Admin dashboard
CREATE INDEX IF NOT EXISTS idx_case_approvals_pending
ON case_approvals(status, created_at DESC)
WHERE status = 'pending';

-- Find approvals handled by a particular Admin
CREATE INDEX IF NOT EXISTS idx_case_approvals_admin
ON case_approvals(admin_id, reviewed_at DESC);

COMMIT;
