# EvidenceVault — API Development & Testing Register

**Project:** EvidenceVault — Secure Cloud-Based Digital Evidence Storage & Case Management Platform  
**Local API base URL:** `http://localhost:5001`  
**Backend:** Node.js, Express 5, PostgreSQL  
**Authentication:** JWT Bearer token; current user role is loaded from the database  
**Last updated:** 8 November 2026

> This register distinguishes code that exists from behavior that has actually been tested. “Implemented — test pending” does not mean the endpoint has passed functional or authorization testing. Update this file whenever an endpoint or test changes.

## 1. Status definitions

- **Tested — passed:** A request was executed and its expected result was observed.
- **Implemented — test pending:** The route/controller exists, but a functional test result has not yet been recorded.
- **Not implemented:** No implementation has been confirmed.
- **Needs retest:** Code or schema changed after the last recorded test.

## 2. API inventory

### 2.1 Authentication

Base path: `/api/auth`

| Method | Endpoint | Purpose | Authentication | Current status |
|---|---|---|---|---|
| POST | `/register` | Register a new client account | Public | Tested — passed (registration was exercised) |
| POST | `/login` | Authenticate and issue a JWT | Public | Tested — passed (client, professional and admin logins used during API testing) |
| GET | `/me` | Return the authenticated user's profile | Bearer JWT | Implemented — test pending |

### 2.2 Professional directory

Base path: `/api/professionals`

| Method | Endpoint | Purpose | Authentication | Current status |
|---|---|---|---|---|
| GET | `/` | List lawyers/investigators; supports `search` and `role` query parameters | Bearer JWT | Implemented — test pending |

### 2.3 Case requests

Base path: `/api/case-requests`

| Method | Endpoint | Purpose | Required role | Current status |
|---|---|---|---|---|
| POST | `/` | Client submits a request to a lawyer/investigator | client | Tested — passed |
| GET | `/received` | List requests received by the authenticated professional; optional `status` filter | lawyer, investigator | Implemented — test pending |
| PATCH | `/:id/review` | Accept, reject or request more information | lawyer, investigator | Tested — accept path passed; reject and request-information paths need separate tests |
| GET | `/:id/responses` | Retrieve chronological response history for the request owner or receiving professional | client, lawyer, investigator | Tested — client owner received `200`; unrelated investigator received `404` |
| POST | `/:id/convert` | Convert an accepted request into a formal case | lawyer, investigator | Tested — passed; created a case in `pending_approval` |

### 2.4 Admin

Base path: `/api/admin`

All routes in this router require a valid JWT and the `admin` role.

| Method | Endpoint | Purpose | Required role | Current status |
|---|---|---|---|---|
| POST | `/professionals` | Create a lawyer/investigator account | admin | Implemented — test pending |
| GET | `/professionals` | List professional accounts | admin | Implemented — test pending |
| GET | `/cases/pending` | List cases awaiting admin approval | admin | Tested — passed; returned the pending EvidenceVault test case |
| PATCH | `/cases/:id/review` | Approve, reject or request changes to a case | admin | Tested — approve path passed; reject and request-changes paths need separate tests |

### 2.5 Documents and S3

Base path: `/api/documents`

All routes require a valid JWT. The inspected controller checks document ownership against `req.user.id`.

| Method | Endpoint | Purpose | Current status |
|---|---|---|---|
| POST | `/upload-url` | Validate file metadata/type/size, create a pending document row and return an S3 presigned PUT URL | Implemented — test pending |
| POST | `/:id/confirm` | Verify uploaded S3 object's size, content type and AES256 server-side encryption; activate the document | Implemented — test pending |
| GET | `/my-documents` | List the authenticated user's active documents | Implemented — test pending |
| GET | `/:id/download-url` | Generate a presigned download URL for an owned active document | Implemented — test pending |
| DELETE | `/:id` | Delete the S3 object and mark the owned document as deleted | Implemented — test pending |

**Current scope note:** The inspected upload controller creates S3 keys under `users/{userId}/...` and does not accept a `case_id` in the upload request schema. Case-linked document access and shared case-member authorization are therefore not confirmed as implemented yet.

### 2.6 Health and temporary test route

| Method | Endpoint | Purpose | Current status |
|---|---|---|---|
| GET | `/api/health` | Check database connectivity | Implemented — test pending |
| GET | `/api/test/admin` | Temporary Admin-only RBAC test endpoint | Present in `server.js`; remove after dedicated RBAC verification or document its temporary purpose |

## 3. Verified end-to-end test record

The following tests were exercised during development on 8 November 2026.

| Test ID | Feature | Test performed | Expected result | Observed result | Status |
|---|---|---|---|---|---|
| EV-API-001 | Case request | Client submitted a request | `201 Created` | Request created | Passed |
| EV-API-002 | Professional review | Lawyer accepted the request with a response message | `200 OK` | Request status became `accepted`; response-history row and audit event were created | Passed |
| EV-API-003 | Response history | Request-owning client fetched response history | `200 OK`, one response | `200 OK`, `total: 1`, action `accept` | Passed |
| EV-API-004 | Response-history authorization | Unrelated investigator fetched the same request history | Access denied without disclosing existence | `404 Not Found`, `Case request not found` | Passed |
| EV-API-005 | Case conversion | Owning lawyer converted the accepted request | `201 Created`; case pending approval | `201 Created`; case `EV-20261108-DA9DB654` created with `pending_approval` | Passed |
| EV-API-006 | Conversion database integrity | Queried `cases`, `case_clients`, `case_assignments`, `case_approvals`, `case_requests`, and `audit_logs` | All related records consistent | All six checks returned expected records and statuses | Passed |
| EV-API-007 | Admin pending list | Admin fetched pending cases | `200 OK`; pending case listed | `200 OK`; one pending case returned with professional/client details | Passed |
| EV-API-008 | Admin approval | Admin approved the test case with comments | `200 OK`; case active and approval approved | `200 OK`; case became `active`, approval became `approved` | Passed |
| EV-API-009 | Approval persistence | Queried case and approval records in `evidencevault_db` | Case `active`; approval `approved`; admin/review timestamp stored | All values matched | Passed |
| EV-API-010 | Audit trail | Queried audit logs for the converted case | Conversion and approval events present | `CASE_APPROVED` and `CASE_REQUEST_CONVERTED` found | Passed |

### Test data reference

- Test case number: `EV-20261108-DA9DB654`
- Test case ID: `da9db654-17f3-4c5f-bd78-9e521472a9e6`
- Converted request ID: `d957e62d-cd1f-4a52-8601-44db49a81fc2`
- Final verified case status: `active`
- Final verified approval status: `approved`

These are development test records, not production data. Do not include JWTs, passwords, AWS keys, database passwords, or `.env` contents in this document.

## 4. Important authorization and workflow rules

| Resource/action | Access rule |
|---|---|
| Submit case request | Authenticated clients only |
| Review received request | Only the lawyer/investigator who owns the request |
| Read request response history | Original client or receiving professional; unrelated users receive `404` |
| Convert accepted request | Only the professional who received it; request must be `accepted` |
| List pending cases | Admin only |
| Review case approval | Admin only |
| Read/update personal documents | Current controller restricts document operations to the uploading user |
| Case document sharing | Not yet confirmed; requires case membership/assignment authorization work |

## 5. Known test gaps and next actions

Prioritize these tests before describing the entire API surface as fully tested.

1. **Authentication**
   - Invalid credentials return `401`.
   - Missing, malformed and expired JWTs return `401`.
   - `/me` returns the authenticated user's current database role.
2. **Role-based access**
   - Client cannot access Admin endpoints.
   - Lawyer/investigator cannot access Admin endpoints.
   - Admin-only routes reject non-admin users.
3. **Case requests**
   - `GET /received` returns only the current professional's requests.
   - Invalid UUID returns `400`.
   - Reject and request-information actions update status and history correctly.
   - A second review of a terminal request returns `409`.
4. **Response history**
   - Receiving professional can read their own request history.
   - Missing request returns `404`.
   - Invalid UUID returns `400`.
5. **Case conversion**
   - Non-owner professional is denied.
   - Non-accepted request returns `409`.
   - Repeated conversion is prevented.
   - Transaction rollback is verified for a forced failure in a development environment.
6. **Admin approval**
   - Admin can reject a pending case.
   - Admin can request changes.
   - Non-admin cannot list or review approvals.
   - A second review of a completed approval returns `409`.
   - Required comments validation is enforced for rejection/change requests.
7. **Documents/S3**
   - Valid upload URL generation and actual S3 PUT.
   - Invalid extension/content type and oversized file are rejected.
   - Upload confirmation rejects wrong size/content type/encryption.
   - Owner can list/download/delete their document.
   - Another user cannot confirm, download or delete it.
   - S3 deletion and database status behavior are checked on failure.
8. **Case access and case-linked documents**
   - Implement and test role-scoped case list/detail APIs.
   - Integrate documents with case IDs and enforce client/professional case membership.
   - Ensure only authorized case participants can access case documents.

## 6. How to update this register

Whenever a new endpoint is added or tested:

1. Add/update its row in **API inventory**.
2. Record the request method, URL, role, body/query parameters and expected HTTP status.
3. Add a row to **Verified end-to-end test record** only after running the test.
4. Record both positive and negative authorization tests.
5. Verify important database changes with SQL and record the result.
6. Change status to **Needs retest** if relevant controller, route, middleware, schema or authorization logic changes.
7. Never record secrets or full presigned URLs/JWTs.

## 7. Suggested repository documentation structure

```text
EvidenceVault/
├── docs/
│   ├── API_DOCUMENTATION.md
│   ├── API_TESTING_REGISTER.md
│   ├── DATABASE_SCHEMA.md
│   └── SYSTEM_ARCHITECTURE.md
├── backend/
├── frontend/
└── README.md
```

**Current next development focus:** secure role-based case listing/detail APIs, followed by case-linked document access and S3 authorization tests.
