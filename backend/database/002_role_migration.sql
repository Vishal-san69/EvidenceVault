
BEGIN;

-- Remove the existing role restriction.
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_role_check;

-- Convert legacy viewer accounts into client accounts.
UPDATE users
SET role = 'client',
    updated_at = CURRENT_TIMESTAMP
WHERE role = 'viewer';

-- New public registrations will default to client.
ALTER TABLE users
ALTER COLUMN role SET DEFAULT 'client';

-- Allow only the four approved roles.
ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (
    role IN (
        'admin',
        'lawyer',
        'investigator',
        'client'
    )
);

COMMIT;
