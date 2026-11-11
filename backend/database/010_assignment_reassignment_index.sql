
BEGIN;

-- Remove the original unconditional unique constraint.
ALTER TABLE public.case_assignments
DROP CONSTRAINT IF EXISTS case_assignments_unique_professional;

-- Remove an existing index if this migration is being reapplied.
DROP INDEX IF EXISTS public.case_assignments_unique_professional;

-- Enforce uniqueness only for active and pending assignments.
CREATE UNIQUE INDEX case_assignments_unique_professional
ON public.case_assignments (case_id, professional_id)
WHERE status IN ('pending_acceptance', 'accepted');

COMMIT;
