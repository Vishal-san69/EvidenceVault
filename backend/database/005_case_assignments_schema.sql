
BEGIN;

-- ============================================
-- EVIDENCEVAULT: CASE ASSIGNMENTS
-- Migration: 005_case_assignments_schema.sql
-- ============================================

CREATE TABLE IF NOT EXISTS case_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    case_id UUID NOT NULL
        REFERENCES cases(id) ON DELETE RESTRICT,

    professional_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    assigned_by UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    role VARCHAR(20) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'pending_acceptance',

    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    responded_at TIMESTAMPTZ,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT case_assignments_role_check
    CHECK (role IN ('lawyer', 'investigator')),

    CONSTRAINT case_assignments_status_check
    CHECK (
        status IN (
            'pending_acceptance',
            'accepted',
            'declined',
            'revoked'
        )
    ),

    CONSTRAINT case_assignments_response_check
    CHECK (
        (status = 'pending_acceptance' AND responded_at IS NULL)
        OR
        (status <> 'pending_acceptance' AND responded_at IS NOT NULL)
    ),

    CONSTRAINT case_assignments_unique_professional
    UNIQUE (case_id, professional_id)
);

-- Find assignments belonging to a professional
CREATE INDEX IF NOT EXISTS idx_case_assignments_professional
ON case_assignments(professional_id, status, assigned_at DESC);

-- Find all assignments for a case
CREATE INDEX IF NOT EXISTS idx_case_assignments_case
ON case_assignments(case_id, status);

-- Find assignments created by an Admin
CREATE INDEX IF NOT EXISTS idx_case_assignments_admin
ON case_assignments(assigned_by, assigned_at DESC);

COMMIT;
