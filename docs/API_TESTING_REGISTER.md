# EvidenceVault – API Testing Register

**Project:** EvidenceVault  
**Backend:** Node.js, Express 5, PostgreSQL  
**Storage:** AWS S3  
**Backend URL (local):** `http://localhost:5001`  
**Last updated:** 8 November 2026

## 1. API Inventory

EvidenceVault currently exposes 23 HTTP endpoints, including the health check and temporary RBAC test endpoint.

| No. | Method | Endpoint | Access |
|---:|---|---|---|
| 1 | POST | `/api/auth/register` | Public |
| 2 | POST | `/api/auth/login` | Public |
| 3 | GET | `/api/auth/me` | Authenticated |
| 4 | POST | `/api/admin/professionals` | Admin |
| 5 | GET | `/api/admin/professionals` | Admin |
| 6 | GET | `/api/admin/cases/pending` | Admin |
| 7 | PATCH | `/api/admin/cases/:id/review` | Admin |
| 8 | GET | `/api/professionals` | Authenticated |
| 9 | POST | `/api/case-requests` | Client |
| 10 | GET | `/api/case-requests/received` | Lawyer, Investigator |
| 11 | PATCH | `/api/case-requests/:id/review` | Lawyer, Investigator |
| 12 | GET | `/api/case-requests/:id/responses` | Client, Lawyer, Investigator |
| 13 | POST | `/api/case-requests/:id/convert` | Lawyer, Investigator |
| 14 | GET | `/api/cases` | Authenticated |
| 15 | GET | `/api/cases/:id` | Authenticated, subject to case access |
| 16 | POST | `/api/documents/upload-url` | Authenticated |
| 17 | POST | `/api/documents/:id/confirm` | Authenticated |
| 18 | GET | `/api/documents/my-documents` | Authenticated |
| 19 | GET | `/api/documents/cases/:caseId` | Authenticated, subject to case access |
| 20 | GET | `/api/documents/:id/download-url` | Authenticated, subject to document access |
| 21 | DELETE | `/api/documents/:id` | Authenticated, subject to ownership/role rules |
| 22 | GET | `/api/health` | Public |
| 23 | GET | `/api/test/admin` | Admin (temporary test endpoint) |

## 2. Authentication APIs

### POST /api/auth/register
**Purpose:** Register a new client account.

- Implementation: Present
- Testing: Registration flow previously exercised.
- Additional tests to record: Duplicate email, invalid input, password validation and unexpected database errors.

### POST /api/auth/login
**Purpose:** Authenticate a user and return a JWT.

- Implementation: Present
- Testing: Successful login confirmed for test accounts.
- Additional tests to record: Incorrect password, unknown email, malformed input and inactive account handling if supported.

### GET /api/auth/me
**Purpose:** Return the authenticated user's profile.

- Implementation: Present
- Testing: Previously tested.
- Additional tests to record: Missing token, invalid token and expired token.

## 3. Admin APIs

All endpoints in `/api/admin` require authentication and the `admin` role.

### POST /api/admin/professionals
**Purpose:** Create a professional account.

- Implementation: Present
- Testing: Pending verification in this register.

### GET /api/admin/professionals
**Purpose:** List professional accounts.

- Implementation: Present
- Testing: Pending verification in this register.

### GET /api/admin/cases/pending
**Purpose:** Retrieve cases awaiting administrative approval.

- Implementation: Present
- Testing: Passed — returned HTTP 200 and the pending case.

### PATCH /api/admin/cases/:id/review
**Purpose:** Approve, reject or request changes to a formal case.

Supported actions:
- `approve`
- `reject`
- `request_changes`

- Implementation: Present
- Testing: Approval flow passed — HTTP 200.
- Database verification: Case status changed to `active`; approval status changed to `approved`; administrator ID and review comments were recorded.
- Audit verification: `CASE_APPROVED` and `CASE_REQUEST_CONVERTED` events were present.
- Pending tests: Rejection, request-changes, invalid action and review of an already-reviewed case.

## 4. Professional APIs

### GET /api/professionals
**Purpose:** Allow authenticated users to browse lawyers and investigators.

- Implementation: Present
- Query parameters: `search`, `role`
- Testing: Previously exercised during the case-request workflow.
- Additional tests: Role filtering, search filtering and unauthorized access.

## 5. Case Request APIs

### POST /api/case-requests
**Purpose:** Allow a client to submit a request to a professional.

- Implementation: Present
- Testing: Case-request workflow exercised.
- Additional tests: Invalid professional, invalid input and duplicate active requests.

### GET /api/case-requests/received
**Purpose:** Allow lawyers and investigators to view incoming requests.

- Implementation: Present
- Testing: Workflow exercised.
- Additional tests: Empty results and role-based access.

### PATCH /api/case-requests/:id/review
**Purpose:** Allow a professional to accept, reject or request additional information.

- Implementation: Present
- Testing: Accepted-request workflow exercised.
- Additional tests: Rejection, information request, invalid action and requests owned by another professional.

### GET /api/case-requests/:id/responses
**Purpose:** Retrieve the response history of a case request.

- Implementation: Present
- Testing:
  - Authorized client: HTTP 200; response history returned.
  - Unrelated investigator: HTTP 404.
- Database verification: Response history was recorded in `case_request_responses`.

### POST /api/case-requests/:id/convert
**Purpose:** Convert an accepted request into a formal case.

- Implementation: Present
- Testing: Passed — HTTP 201.
- Test request ID: `d957e62d-cd1f-4a52-8601-44db49a81fc2`
- Created case ID: `da9db654-17f3-4c5f-bd78-9e521472a9e6`
- Created case number: `EV-20261108-DA9DB654`
- Database verification:
  - Formal case created with `pending_approval` status.
  - Client linked through `case_clients`.
  - Professional assignment recorded as accepted.
  - Pending approval record created.
  - Original request changed to `converted_to_case`.
  - Audit event `CASE_REQUEST_CONVERTED` recorded.

## 6. Case Management APIs

### GET /api/cases
**Purpose:** List cases accessible to the authenticated user.

- Implementation: Present
- Testing: Passed for the Admin role — HTTP 200.
- Additional tests: Client, lawyer and investigator list filtering.

### GET /api/cases/:id
**Purpose:** Retrieve an individual case after checking access permissions.

- Implementation: Present
- Testing:
  - Admin: HTTP 200.
  - Linked client: HTTP 200.
  - Assigned lawyer: HTTP 200.
  - Unrelated client: HTTP 404.
  - Unauthenticated request: HTTP 401.
- Result: Case-level authorization checks passed for the tested scenarios.

## 7. Document Management APIs

Documents are stored in a private AWS S3 bucket. Upload and download operations use presigned URLs.

### POST /api/documents/upload-url
**Purpose:** Generate a presigned S3 upload URL and create a pending document record.

- Implementation: Present
- Testing:
  - Personal document upload URL: Passed.
  - Case-linked document upload URL: Passed.
- S3 upload requires the signed server-side encryption header `x-amz-server-side-encryption: AES256`.

### POST /api/documents/:id/confirm
**Purpose:** Verify the uploaded S3 object and activate the document record.

- Implementation: Present
- Testing:
  - Personal document confirmation: Passed.
  - Case-linked document confirmation: Passed.
- S3 object size, content type and AES256 encryption verification exercised.

### GET /api/documents/my-documents
**Purpose:** List the authenticated user's active personal documents.

- Implementation: Present
- Testing: Passed — personal document appeared with `active` status.

### GET /api/documents/cases/:caseId
**Purpose:** List active documents linked to a case.

- Implementation: Present
- Testing:
  - Linked client: Passed.
  - Assigned lawyer: Passed.
  - Unrelated client: HTTP 404.
  - After deletion: deleted document no longer appeared in the active document list.

### GET /api/documents/:id/download-url
**Purpose:** Generate a presigned download URL after authorization checks.

- Implementation: Present
- Testing:
  - Personal document download: Passed.
  - Assigned lawyer downloading a case document: Passed.
  - Unrelated client: HTTP 404.
  - Downloaded content matched the original file.
- Integrity verification: SHA-256 hash of the downloaded personal document matched the original file.
- Note: Presigned URLs expire and must be regenerated when expired.

### DELETE /api/documents/:id
**Purpose:** Delete a document from S3 and mark its database record as deleted.

- Implementation: Present
- Testing:
  - Assigned lawyer attempting to delete another user's document: HTTP 403.
  - Original uploader deleting the case document: Passed.
- Database verification: Document status changed to `deleted`.
- S3 verification: Case document object was deleted; the separate personal document remained.

## 8. Health and Temporary Testing APIs

### GET /api/health
**Purpose:** Check API and PostgreSQL connectivity.

- Implementation: Present
- Testing: Passed — HTTP 200.
- Response confirmed:
  - API running.
  - Database connected.

### GET /api/test/admin
**Purpose:** Temporary endpoint to test Admin-only authorization.

- Implementation: Present in `server.js`.
- Access: Authenticated Admin only.
- Testing: RBAC test endpoint was used during authorization checks.
- Production action: Remove this temporary endpoint before deployment.

## 9. Test Environment

| Component | Configuration |
|---|---|
| Backend | Express 5 |
| Database | PostgreSQL 18.6 |
| Database name | `evidencevault_db` |
| Backend port | `5001` |
| Frontend port | `5174` |
| Cloud storage | AWS S3 |
| AWS region | `ap-south-1` |
| Authentication | JWT |
| Password hashing | bcrypt |

Test credentials and secrets must never be committed to this document.

## 10. Database Verification Checklist

The following tables have been used or verified during the tested workflows:

- `users`
- `cases`
- `case_clients`
- `case_assignments`
- `case_approvals`
- `case_requests`
- `case_request_responses`
- `documents`
- `audit_logs`

Additional workflow tables:
- `case_members`
- `document_requests`

Database verification has confirmed the case conversion, case approval, client linking, professional assignment, document status changes and relevant audit events described above.

## 11. Pending Testing Work

The following items still need explicit test evidence before being marked passed:

1. Admin professional creation and listing.
2. Admin case rejection.
3. Admin request-changes workflow.
4. Invalid and repeated Admin review attempts.
5. Authentication negative cases and token expiry.
6. Professional search and role filters.
7. Case-request rejection and request-information workflows.
8. Case-request ownership and invalid-input edge cases.
9. Case-list filtering for every user role.
10. Document invalid file type and oversized file rejection.
11. Document upload confirmation failure and S3 verification failure.
12. Document access after case membership or assignment is revoked.
13. Document deletion failure and S3/database consistency.
14. Rate-limiting behavior.
15. Full frontend-to-backend end-to-end testing.

## 12. Release Readiness

The API inventory is confirmed from the current route files and `server.js`. Several core workflows have passed integration and database checks, particularly case conversion, Admin approval, role-based case access and S3 document operations.

The remaining work is to complete the pending negative/edge-case tests, verify the Admin professional APIs, finish frontend integration, and remove temporary test routes before production deployment.

**Important:** An implemented endpoint is not automatically a tested endpoint. Update the status only after recording the actual HTTP response and, where relevant, database or S3 verification evidence.


# EvidenceVault – API Testing Register

**Project:** EvidenceVault  
**Backend:** Node.js, Express 5, PostgreSQL  
**Storage:** AWS S3  
**Backend URL (local):** `http://localhost:5001`  
**Last updated:** 9 November 2026

---

## 1. API Inventory

EvidenceVault currently exposes 27 HTTP endpoints, including the health check and temporary RBAC test endpoint.

| No. | Method | Endpoint | Access |
|---:|---|---|---|
| 1 | POST | `/api/auth/register` | Public |
| 2 | POST | `/api/auth/login` | Public |
| 3 | GET | `/api/auth/me` | Authenticated |
| 4 | POST | `/api/admin/professionals` | Admin |
| 5 | GET | `/api/admin/professionals` | Admin |
| 6 | GET | `/api/admin/cases/pending` | Admin |
| 7 | PATCH | `/api/admin/cases/:id/review` | Admin |
| 8 | POST | `/api/admin/cases/:id/assign` | Admin |
| 9 | GET | `/api/professionals` | Authenticated |
| 10 | PATCH | `/api/professionals/assignments/:id/respond` | Assigned Lawyer, Investigator |
| 11 | POST | `/api/case-requests` | Client |
| 12 | GET | `/api/case-requests/received` | Lawyer, Investigator |
| 13 | PATCH | `/api/case-requests/:id/review` | Lawyer, Investigator |
| 14 | GET | `/api/case-requests/:id/responses` | Client, Lawyer, Investigator |
| 15 | POST | `/api/case-requests/:id/convert` | Lawyer, Investigator |
| 16 | GET | `/api/cases` | Authenticated |
| 17 | GET | `/api/cases/:id` | Authenticated, subject to case access |
| 18 | PATCH | `/api/cases/:id` | Assigned professional |
| 19 | POST | `/api/cases/:id/resubmit` | Assigned professional |
| 20 | POST | `/api/documents/upload-url` | Authenticated |
| 21 | POST | `/api/documents/:id/confirm` | Authenticated |
| 22 | GET | `/api/documents/my-documents` | Authenticated |
| 23 | GET | `/api/documents/cases/:caseId` | Authenticated, subject to case access |
| 24 | GET | `/api/documents/:id/download-url` | Authenticated, subject to document access |
| 25 | DELETE | `/api/documents/:id` | Authenticated, subject to ownership/role rules |
| 26 | GET | `/api/health` | Public |
| 27 | GET | `/api/test/admin` | Admin (temporary test endpoint) |

---

## 2. Authentication APIs

### POST /api/auth/register

**Purpose:** Register a new client account.

- Implementation: Present
- Testing: Registration flow previously exercised.
- Additional tests to record:
  - Duplicate email.
  - Invalid input.
  - Password validation.
  - Unexpected database errors.

### POST /api/auth/login

**Purpose:** Authenticate a user and return a JWT.

- Implementation: Present
- Testing: Successful login confirmed for test accounts.
- Additional tests to record:
  - Incorrect password.
  - Unknown email.
  - Malformed input.
  - Inactive account handling, if supported.

### GET /api/auth/me

**Purpose:** Return the authenticated user's profile.

- Implementation: Present
- Testing: Previously tested.
- Additional tests to record:
  - Missing token.
  - Invalid token.
  - Expired token.

---

## 3. Admin APIs

All endpoints in `/api/admin` require authentication and the `admin` role.

### POST /api/admin/professionals

**Purpose:** Create a professional account.

- Implementation: Present
- Testing: Pending verification in this register.

### GET /api/admin/professionals

**Purpose:** List professional accounts.

- Implementation: Present
- Testing: Pending verification in this register.

### GET /api/admin/cases/pending

**Purpose:** Retrieve cases awaiting administrative approval.

- Implementation: Present
- Testing: Passed — HTTP 200 and pending case returned.

### PATCH /api/admin/cases/:id/review

**Purpose:** Approve, reject or request changes to a formal case.

Supported actions:

- `approve`
- `reject`
- `request_changes`

- Implementation: Present
- Testing: Approval flow passed — HTTP 200.
- Database verification:
  - Case status changed to `active`.
  - Approval status changed to `approved`.
  - Administrator ID and review comments recorded.
- Audit verification:
  - `CASE_APPROVED`
  - `CASE_REQUEST_CONVERTED`
- Pending tests:
  - Rejection.
  - Request changes.
  - Invalid action.
  - Review of an already-reviewed case.

### POST /api/admin/cases/:id/assign

**Purpose:** Allow an Admin to assign an additional lawyer or investigator to an existing case.

- Implementation: Present.
- Testing: Passed — HTTP 201.
- Test case ID: `f21aa057-2d73-45d1-b09f-4bb117dcbf9a`
- Assignment ID: `fa5ba692-f948-4a04-a8a3-c8a1248dcf73`
- Assigned professional: EvidenceVault Test Investigator.
- Professional role: `investigator`.
- Initial assignment status: `pending_acceptance`.
- Admin authentication: Passed.
- Database verification:
  - Assignment ID generated successfully.
  - Correct case ID recorded.
  - Correct professional ID recorded.
  - Admin ID recorded in `assigned_by`.
  - Professional role recorded.
  - Initial status set to `pending_acceptance`.
  - `responded_at` initially null.
- Audit logging: Assignment creation event implemented transactionally.
- Duplicate pending/accepted assignment prevention: Implemented; negative test pending.
- Pending tests:
  - Invalid case ID.
  - Invalid professional ID.
  - Duplicate assignment.
  - Unauthorized non-Admin access.

---

## 4. Professional APIs

### GET /api/professionals

**Purpose:** Allow authenticated users to browse lawyers and investigators.

- Implementation: Present.
- Query parameters:
  - `search`
  - `role`
- Testing: Previously exercised during the case-request workflow.
- Additional tests:
  - Role filtering.
  - Search filtering.
  - Unauthorized access.

### PATCH /api/professionals/assignments/:id/respond

**Purpose:** Allow an assigned lawyer or investigator to accept or reject a case assignment.

Supported actions:

- `accept`
- `reject`

- Implementation: Present.
- Testing: Acceptance passed — HTTP 200.
- Test assignment ID: `fa5ba692-f948-4a04-a8a3-c8a1248dcf73`.
- Test professional: EvidenceVault Test Investigator.
- Initial status: `pending_acceptance`.
- Final status: `accepted`.
- Database verification:
  - Assignment status updated to `accepted`.
  - `responded_at` timestamp recorded.
- Audit logging:
  - `CASE_ASSIGNMENT_ACCEPTED` event implemented transactionally.
- Authorization:
  - Professional role checked.
  - Assignment ownership checked against authenticated user ID.
  - Only pending assignments can be accepted or rejected.
- Pending tests:
  - Rejection workflow.
  - Repeated response to an already-accepted assignment.
  - Unauthorized professional attempting to respond.
  - Invalid assignment ID.
  - Invalid action.
  - Non-professional account attempting to respond.

---

## 5. Case Request APIs

### POST /api/case-requests

**Purpose:** Allow a client to submit a request to a professional.

- Implementation: Present.
- Testing: Case-request workflow exercised.
- Additional tests:
  - Invalid professional.
  - Invalid input.
  - Duplicate active requests.

### GET /api/case-requests/received

**Purpose:** Allow lawyers and investigators to view incoming requests.

- Implementation: Present.
- Testing: Workflow exercised.
- Additional tests:
  - Empty results.
  - Role-based access.

### PATCH /api/case-requests/:id/review

**Purpose:** Allow a professional to accept, reject or request additional information.

- Implementation: Present.
- Testing: Accepted-request workflow exercised.
- Additional tests:
  - Rejection.
  - Information request.
  - Invalid action.
  - Requests owned by another professional.

### GET /api/case-requests/:id/responses

**Purpose:** Retrieve the response history of a case request.

- Implementation: Present.
- Testing:
  - Authorized client: HTTP 200; response history returned.
  - Unrelated investigator: HTTP 404.
- Database verification: Response history recorded in `case_request_responses`.

### POST /api/case-requests/:id/convert

**Purpose:** Convert an accepted request into a formal case.

- Implementation: Present.
- Testing: Passed — HTTP 201.
- Test request ID: `d957e62d-cd1f-4a52-8601-44db49a81fc2`
- Created case ID: `da9db654-17f3-4c5f-bd78-9e521472a9e6`
- Created case number: `EV-20261108-DA9DB654`

Database verification:

- Formal case created with `pending_approval` status.
- Client linked through `case_clients`.
- Professional assignment recorded as accepted.
- Pending approval record created.
- Original request changed to `converted_to_case`.
- Audit event `CASE_REQUEST_CONVERTED` recorded.

---

## 6. Case Management APIs

### GET /api/cases

**Purpose:** List cases accessible to the authenticated user.

- Implementation: Present.
- Testing: Passed for the Admin role — HTTP 200.
- Additional tests:
  - Client case listing.
  - Lawyer case listing.
  - Investigator case listing.
  - Role-based filtering.

### GET /api/cases/:id

**Purpose:** Retrieve an individual case after checking access permissions.

- Implementation: Present.

Previously tested:

- Admin: HTTP 200.
- Linked client: HTTP 200.
- Assigned lawyer: HTTP 200.
- Unrelated client: HTTP 404.
- Unauthenticated request: HTTP 401.

Additional investigator authorization tests:

- Investigator with pending assignment: HTTP 404.
- Investigator after accepting assignment: HTTP 200.
- Test assignment ID: `fa5ba692-f948-4a04-a8a3-c8a1248dcf73`.
- Test case ID: `f21aa057-2d73-45d1-b09f-4bb117dcbf9a`.

Result:

- Pending assignment did not grant case access.
- Accepted assignment granted case access.
- Case-level authorization passed for the tested scenarios.

### PATCH /api/cases/:id

**Purpose:** Allow an assigned professional to update a case when administrative changes have been requested.

- Implementation: Present.
- Editable fields: Case title and description.
- Access restriction: Assigned professional.
- Case status requirement: `changes_requested`.
- Testing: Update and resubmission workflow previously exercised.
- Additional tests:
  - Unassigned professional.
  - Invalid case ID.
  - Invalid input.
  - Updating a case outside `changes_requested` status.

### POST /api/cases/:id/resubmit

**Purpose:** Allow an assigned professional to resubmit a case after addressing administrative feedback.

- Implementation: Present.
- Testing: Resubmission workflow previously exercised.
- Expected status transition:
  - `changes_requested` → `pending_approval`.
- Approval status reset to pending.
- Previous administrative feedback preserved in the audit history.
- Additional tests:
  - Unauthorized resubmission.
  - Resubmission without addressing changes.
  - Repeated resubmission.
  - Invalid case ID.

---

## 7. Document Management APIs

Documents are stored in a private AWS S3 bucket. Upload and download operations use presigned URLs.

### POST /api/documents/upload-url

**Purpose:** Generate a presigned S3 upload URL and create a pending document record.

- Implementation: Present.
- Testing:
  - Personal document upload URL: Passed.
  - Case-linked document upload URL: Passed.
- S3 upload requires the signed server-side encryption header `x-amz-server-side-encryption: AES256`.

### POST /api/documents/:id/confirm

**Purpose:** Verify the uploaded S3 object and activate the document record.

- Implementation: Present.
- Testing:
  - Personal document confirmation: Passed.
  - Case-linked document confirmation: Passed.
- S3 object size, content type and AES256 encryption verification exercised.

### GET /api/documents/my-documents

**Purpose:** List the authenticated user's active personal documents.

- Implementation: Present.
- Testing: Passed — personal document appeared with `active` status.

### GET /api/documents/cases/:caseId

**Purpose:** List active documents linked to a case.

- Implementation: Present.

Previously tested:

- Linked client: Passed.
- Assigned lawyer: Passed.
- Unrelated client: HTTP 404.
- After deletion: Deleted document no longer appeared in the active document list.

Additional cross-member investigator test:

- Investigator accessed a case document uploaded by another professional.
- Test case ID: `f21aa057-2d73-45d1-b09f-4bb117dcbf9a`.
- Test document ID: `e472ee3a-64d5-4353-99ea-af712fc7dbcd`.
- Investigator assignment status: `accepted`.
- Document owner: Original lawyer.
- Document status: `active`.
- Document name: `supporting-document.txt`.
- File size: 248 bytes.
- Testing: Passed — HTTP 200.
- Result: Accepted case assignment permitted cross-member document listing.

### GET /api/documents/:id/download-url

**Purpose:** Generate a presigned download URL after authorization checks.

- Implementation: Present.

Previously tested:

- Personal document download: Passed.
- Assigned lawyer downloading a case document: Passed.
- Unrelated client: HTTP 404.
- Downloaded content matched the original file.
- Integrity verification: SHA-256 hash of downloaded personal document matched the original file.

Additional cross-member investigator download test:

- Investigator generated a download URL for another professional's case document.
- Testing: Passed.
- Presigned URL generation: Passed.
- URL expiry: 300 seconds.
- Filename: `supporting-document.txt`.
- Actual S3 download: Passed.
- Downloaded file size: 248 bytes.

SHA-256 integrity verification:

- Original uploader-side SHA-256:
  `A14D7E1F0F6CBDDC453803A0D129914D690C514A25562B9F0A33BDAD56E76DDC`
- Investigator-downloaded file SHA-256:
  `A14D7E1F0F6CBDDC453803A0D129914D690C514A25562B9F0A33BDAD56E76DDC`

Result:

- Original and downloaded hashes matched exactly.
- Actual S3 object download verified.
- Cross-member document download authorization passed.
- Presigned URL expiry behavior: 300 seconds.

Note: Presigned URLs expire and must be regenerated when expired. Do not expose presigned URLs in logs or documentation.

### DELETE /api/documents/:id

**Purpose:** Delete a document from S3 and mark its database record as deleted.

- Implementation: Present.
- Testing:
  - Assigned lawyer attempting to delete another user's document: HTTP 403.
  - Original uploader deleting the case document: Passed.
- Database verification: Document status changed to `deleted`.
- S3 verification: Case document object was deleted; the separate personal document remained.

---

## 8. Health and Temporary Testing APIs

### GET /api/health

**Purpose:** Check API and PostgreSQL connectivity.

- Implementation: Present.
- Testing: Passed — HTTP 200.
- Response confirmed:
  - API running.
  - Database connected.

### GET /api/test/admin

**Purpose:** Temporary endpoint to test Admin-only authorization.

- Implementation: Present in `server.js`.
- Access: Authenticated Admin only.
- Testing: RBAC test endpoint was used during authorization checks.
- Production action: Remove this temporary endpoint before deployment.

---

## 9. Test Environment

| Component | Configuration |
|---|---|
| Backend | Express 5 |
| Database | PostgreSQL 18.6 |
| Database name | `evidencevault_db` |
| Backend port | `5001` |
| Frontend port | `5174` |
| Cloud storage | AWS S3 |
| AWS region | `ap-south-1` |
| Authentication | JWT |
| Password hashing | bcrypt |

Test credentials, passwords, JWT tokens, AWS access keys and presigned URLs must never be committed to this document.

---

## 10. Database Verification Checklist

The following tables have been used or verified during the tested workflows:

- `users`
- `cases`
- `case_clients`
- `case_assignments`
- `case_approvals`
- `case_requests`
- `case_request_responses`
- `documents`
- `audit_logs`

Additional workflow tables:

- `case_members`
- `document_requests`

Database verification has confirmed:

- Case conversion.
- Case approval.
- Client linking.
- Professional assignment.
- Assignment status changes.
- Assignment acceptance timestamp.
- Document status changes.
- Relevant audit events.
- Case-level access based on accepted assignment.

The `case_assignments` table includes:

- `id`
- `case_id`
- `professional_id`
- `assigned_by`
- `role`
- `status`
- `assigned_at`
- `responded_at`
- `updated_at`

Assignment statuses exercised:

- `pending_acceptance`
- `accepted`

The rejection workflow is implemented but still requires an explicit test.

---

## 11. Pending Testing Work

The following items still need explicit test evidence before being marked passed:

1. Admin professional creation and listing.
2. Admin case rejection.
3. Admin request-changes workflow.
4. Invalid and repeated Admin review attempts.
5. Authentication negative cases and token expiry.
6. Professional search and role filters.
7. Case-request rejection and request-information workflows.
8. Case-request ownership and invalid-input edge cases.
9. Case-list filtering for every user role.
10. Document invalid file type and oversized file rejection.
11. Document upload confirmation failure and S3 verification failure.
12. Document access after case membership or assignment is revoked.
13. Document deletion failure and S3/database consistency.
14. Rate-limiting behavior.
15. Full frontend-to-backend end-to-end testing.
16. Professional assignment rejection workflow.
17. Repeated assignment response and unauthorized assignment response.
18. Duplicate assignment prevention.
19. Case access after assignment revocation.
20. Cross-member document access after assignment revocation.
21. Invalid assignment ID and invalid assignment action.
22. Non-professional account attempting to respond to an assignment.
23. Assignment response audit-log verification through a database query.

---

## 12. Release Readiness

The API inventory is based on the current route files and `server.js`.

Several core workflows have passed integration and database checks, particularly:

- Authentication.
- Case request conversion.
- Administrative case approval.
- Case changes and resubmission.
- Role-based case access.
- Professional assignment creation.
- Professional assignment acceptance.
- Pending versus accepted assignment authorization.
- Private S3 document upload and retrieval.
- Cross-member document listing.
- Cross-member S3 download.
- SHA-256 file integrity verification.

The assignment authorization workflow has demonstrated that a professional cannot access the tested case while an assignment is pending, but can access it after accepting the assignment.

The document-sharing workflow has demonstrated that an authorized investigator can retrieve and download another professional's case document without changing document ownership.

The remaining work is to:

1. Complete pending negative and edge-case tests.
2. Verify Admin professional APIs.
3. Complete professional assignment rejection testing.
4. Test access revocation.
5. Finish frontend integration.
6. Complete full end-to-end testing.
7. Remove temporary test routes and diagnostic logging.
8. Prepare AWS deployment.
9. Complete production security review.
10. Finalize project documentation and demonstration.

**Important:** An implemented endpoint is not automatically a tested endpoint. Update the status only after recording the actual HTTP response and, where relevant, database or S3 verification evidence.
