BEGIN;

CREATE TABLE IF NOT EXISTS case_request_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    request_id UUID NOT NULL
        REFERENCES case_requests(id)
        ON DELETE RESTRICT,

    professional_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    previous_status VARCHAR(30) NOT NULL,

    new_status VARCHAR(30) NOT NULL,

    action VARCHAR(30) NOT NULL,

    response_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT case_request_responses_action_check
        CHECK (
            action IN (
                'accept',
                'reject',
                'request_information'
            )
        ),

    CONSTRAINT case_request_responses_previous_status_check
        CHECK (
            previous_status IN (
                'pending',
                'under_review',
                'needs_information'
            )
        ),

    CONSTRAINT case_request_responses_new_status_check
        CHECK (
            new_status IN (
                'accepted',
                'rejected',
                'needs_information'
            )
        ),

    CONSTRAINT case_request_responses_action_status_check
        CHECK (
            (action = 'accept' AND new_status = 'accepted')
            OR
            (action = 'reject' AND new_status = 'rejected')
            OR
            (
                action = 'request_information'
                AND new_status = 'needs_information'
            )
        )
);

-- Retrieve response history for a particular request.
CREATE INDEX idx_case_request_responses_request
ON case_request_responses(request_id, created_at DESC);

-- Retrieve responses made by a particular professional.
CREATE INDEX idx_case_request_responses_professional
ON case_request_responses(professional_id, created_at DESC);

COMMIT;