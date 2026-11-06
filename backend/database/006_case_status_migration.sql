
BEGIN;

-- Remove the existing status constraint
ALTER TABLE cases
DROP CONSTRAINT IF EXISTS cases_status_check;

-- Map any existing records to the new workflow
UPDATE cases
SET status = CASE
    WHEN status = 'open' THEN 'active'
    WHEN status = 'under_review' THEN 'pending_approval'
    WHEN status = 'closed' THEN 'closed'
    ELSE status
END;

-- Apply the expanded workflow states
ALTER TABLE cases
ADD CONSTRAINT cases_status_check
CHECK (
    status IN (
        'draft',
        'pending_approval',
        'changes_requested',
        'active',
        'rejected',
        'closed'
    )
);

COMMIT;
