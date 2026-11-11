# EvidenceVault

**Secure Cloud-Based Digital Evidence and Case Document Management
System**

EvidenceVault is a cloud-first document and digital evidence management
platform being developed from the existing CloudVault application. The
goal is to support case-based document organization, controlled access,
document integrity verification, version history, and auditable
activity.

> **Project status:** The initial repository baseline has been created
> from CloudVault. Case management, role-based access control (RBAC),
> audit trails, SHA-256 integrity verification, document versioning, and
> production deployment are planned milestones. Do not describe planned
> capabilities as implemented until they have been built and tested.

> **Demo-data warning:** Use fictional case data and test documents
> only. Do not upload real police records, FIRs, witness statements,
> investigation records, or other sensitive personal/legal documents.

## 1. Repositories

-   **EvidenceVault (active development):**
    https://github.com/Vishal-san69/EvidenceVault
-   **CloudVault (preserved baseline):**
    https://github.com/Vishal-san69/CloudVault

CloudVault is retained as the original working document-storage project.
EvidenceVault is developed in a separate local folder and GitHub
repository.

## 2. Technology stack

  -----------------------------------------------------------------------
  Layer                   Technology              Purpose
  ----------------------- ----------------------- -----------------------
  Frontend                React 19, TypeScript,   Browser interface
                          Vite                    

  Styling                 Tailwind CSS 4 and      UI styling
                          project CSS             

  Backend                 Node.js, Express 5      REST API and business
                                                  logic

  Database                PostgreSQL              Users and document
                                                  metadata

  Database driver         `pg`                    PostgreSQL connection
                                                  pool

  Authentication          JWT and password        User authentication
                          hashing                 

  Cloud object storage    Amazon S3               Actual document files

  AWS integration         AWS SDK for JavaScript  S3 operations and
                                                  presigned URLs

  HTTP client             Axios                   Frontend-to-backend API
                                                  requests

  Icons                   lucide-react            Interface icons
  -----------------------------------------------------------------------

Exact package versions are recorded in `backend/package-lock.json` and
`frontend/package-lock.json`. Use `npm ci` to install the locked
dependency versions.

## 3. Architecture overview

``` text
Browser
  |
  | React + TypeScript
  | Axios requests, JWT bearer token
  v
Node.js + Express API
  |                     |
  | SQL queries         | AWS SDK / presigned URL generation
  v                     v
PostgreSQL             Amazon S3
(users, document       (actual file objects)
 metadata)
```

The frontend sends application API requests to Express. The backend
authenticates users, applies business rules, accesses PostgreSQL, and
creates temporary S3 presigned URLs. For file transfers using presigned
URLs, the browser transfers file bytes directly to S3 rather than
routing the file through Express.

-   PostgreSQL stores structured records, including user information and
    document metadata.
-   Amazon S3 stores the actual document objects.
-   The S3 bucket should remain private. Never put AWS credentials in
    frontend code.

## 4. Prerequisites

Install and configure:

1.  Git.
2.  Node.js and npm. Use a currently supported Node.js LTS release;
    check each `package.json` for an `engines` requirement.
3.  PostgreSQL.
4.  An AWS account and S3 bucket for document-storage features.
5.  AWS credentials for the backend, configured through an appropriate
    local AWS credential profile or supported environment-based
    credential provider.
6.  VS Code or another code editor (optional).

Check installations:

``` powershell
node --version
npm --version
git --version
psql --version
```

## 5. Clone the repository

``` powershell
cd C:\Users\<YOUR_WINDOWS_USER>\Desktop
git clone https://github.com/Vishal-san69/EvidenceVault.git
cd EvidenceVault
```

If the repository has already been cloned, enter the existing project
directory instead.

## 6. Project structure

``` text
EvidenceVault/
├── backend/
│   ├── src/
│   │   ├── config/          # Database, S3 and document configuration
│   │   ├── controllers/     # Request handling and application logic
│   │   ├── middleware/      # Authentication and request middleware
│   │   ├── routes/          # API route definitions
│   │   ├── services/        # S3 and other service operations
│   │   └── server.js        # Express application entry point
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── services/        # API client
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   └── package-lock.json
│
├── .gitignore
└── README.md
```

The structure will evolve as case management, RBAC, audit, integrity,
and versioning modules are implemented.

## 7. Install dependencies

Run these commands from the repository root.

**Backend:**

``` powershell
cd backend
npm ci
```

**Frontend:**

``` powershell
cd ..\frontend
npm ci
```

`npm ci` installs dependencies from the lockfile. Do not delete the
lockfiles.

## 8. Environment configuration

The backend reads configuration from `backend/.env`. This file must
remain local and must never be committed.

Create `backend/.env` locally with the variable names below and values
appropriate to your machine:

``` dotenv
PORT=5000
CLIENT_URL=http://localhost:5173

PGHOST=localhost
PGPORT=5432
PGDATABASE=evidencevault_db
PGUSER=your_postgres_username
PGPASSWORD=replace_with_your_local_database_password

JWT_SECRET=replace_with_a_long_random_secret

AWS_REGION=ap-south-1
AWS_S3_BUCKET=your_private_s3_bucket_name
```

Important:

-   Replace every placeholder with your own configuration.
-   Use a unique, strong JWT secret. Do not use the example text as a
    real secret.
-   Never commit `.env`, AWS access keys, database passwords, or
    production secrets.
-   The AWS SDK must obtain credentials through your configured AWS
    credential provider, such as an AWS CLI profile or environment
    credentials. Do not put AWS credentials in React.
-   Confirm variable names against `backend/src/config/db.js`,
    `backend/src/config/s3.js`, and `backend/src/server.js` if
    configuration changes.
-   The frontend API client currently uses `http://localhost:5000/api`;
    move this to environment-based configuration when preparing
    deployment.

## 9. PostgreSQL setup

Create a separate database for EvidenceVault. Do not point EvidenceVault
development at the CloudVault database.

For example, from `psql` or pgAdmin:

``` sql
CREATE DATABASE evidencevault_db;
```

Set `PGDATABASE=evidencevault_db` in `backend/.env`.

**Schema setup:** The initial CloudVault-derived backend uses PostgreSQL
tables for users, documents, and security activity. Before running the
application, inspect the current backend database setup and apply the
schema SQL or migrations that belong to the checked-out version. The
EvidenceVault case-management schema is a future milestone; do not
assume it exists yet.

Do not run destructive SQL against the original CloudVault database.

## 10. AWS S3 setup

The current application uses Amazon S3 for document objects and
presigned upload/download operations.

1.  Create or select a dedicated S3 bucket for EvidenceVault.
2.  Keep **Block Public Access** enabled.
3.  Keep Object Ownership configured to disable ACL-based public access.
4.  Configure backend AWS credentials through a local AWS credential
    profile or another supported credential provider.
5.  Grant the backend identity only the S3 permissions required by the
    application.
6.  Set `AWS_REGION` and `AWS_S3_BUCKET` in `backend/.env`.
7.  Configure bucket CORS for the exact local frontend origin if
    browser-based presigned uploads are used.

Example development CORS configuration (adjust if the frontend origin
changes):

``` json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:5173"],
    "ExposeHeaders": ["ETag", "x-amz-server-side-encryption"],
    "MaxAgeSeconds": 3000
  }
]
```

CORS is not a substitute for S3 permissions. Keep the bucket private and
never embed AWS access keys in frontend code.

The current upload flow uses server-side AES-256 encryption headers.
Verify S3 object properties after upload rather than assuming encryption
based only on frontend display.

## 11. Run the application locally

Start the backend in Terminal 1:

``` powershell
cd backend
npm run dev
```

If the `dev` script is unavailable in the checked-out version, inspect
`backend/package.json` and use a script defined there (for example,
`npm start` if provided).

Start the frontend in Terminal 2:

``` powershell
cd frontend
npm run dev
```

Open the Vite URL printed in the frontend terminal. Usual local URLs:

-   Frontend: http://localhost:5173
-   Backend API: http://localhost:5000
-   Health check: http://localhost:5000/api/health

The health endpoint checks PostgreSQL connectivity. S3 connectivity is
checked separately during backend startup in the current baseline.

## 12. Current API endpoints

These endpoints are present in the CloudVault-derived backend baseline.
Confirm route definitions in `backend/src/routes/` before relying on
them after future changes.

  -----------------------------------------------------------------------------------
  Method                  Endpoint                            Purpose
  ----------------------- ----------------------------------- -----------------------
  POST                    `/api/auth/register`                Register a user

  POST                    `/api/auth/login`                   Authenticate a user

  GET                     `/api/auth/me`                      Retrieve the
                                                              authenticated user

  POST                    `/api/documents/upload-url`         Request a presigned
                                                              upload URL

  POST                    `/api/documents/:id/confirm`        Confirm an uploaded
                                                              object

  GET                     `/api/documents/my-documents`       List the current user's
                                                              documents

  GET                     `/api/documents/:id/download-url`   Request a presigned
                                                              download URL

  DELETE                  `/api/documents/:id`                Delete a document
  -----------------------------------------------------------------------------------

Protected endpoints require a valid bearer token:

``` http
Authorization: Bearer <JWT>
```

## 13. Document upload and download flow

**Upload:**

1.  User signs in and receives a JWT.
2.  Frontend requests an upload URL from the backend.
3.  Backend authenticates the user and validates the request.
4.  Backend creates a pending document record and generates an S3
    presigned PUT URL.
5.  Browser uploads the file directly to S3 using the URL and required
    headers.
6.  Frontend calls the confirmation endpoint.
7.  Backend verifies the S3 object and updates the document record.
8.  Frontend refreshes the document list.

**Download:**

1.  Frontend requests a download URL for a document ID.
2.  Backend authenticates the user and checks document ownership.
3.  Backend generates a temporary S3 presigned GET URL.
4.  Browser retrieves the file directly from S3.

Presigned URLs are temporary access links. Treat them as sensitive and
do not publish them in logs, screenshots, or issue reports.

## 14. Useful development commands

``` powershell
# Install backend dependencies
cd backend
npm ci

# Run backend in development mode
npm run dev

# Install frontend dependencies
cd ..\frontend
npm ci

# Run frontend in development mode
npm run dev

# Build frontend for production
npm run build

# Check Git status from repository root
cd ..
git status

# Review recent commits
git log --oneline -5
```

Run `npm run` inside either package directory to list the scripts
actually defined by that package's `package.json`.

## 15. Security and repository rules

-   Never commit `.env` files or secrets.
-   Never expose AWS credentials in frontend code.
-   Keep the S3 bucket private and Block Public Access enabled.
-   Use least-privilege IAM permissions.
-   Validate document ownership on the backend for every document
    operation.
-   Validate file type and size on the backend; client-side checks alone
    are insufficient.
-   Treat presigned URLs as temporary sensitive access links.
-   Use fictional data in demonstrations.
-   Do not run schema changes against the CloudVault database from
    EvidenceVault.
-   Review staged files with `git status` before every commit.

## 16. Git workflow

Work from the `evidencevault` directory:

``` powershell
git status
git add .
git status
git commit -m "Describe the change"
git push
```

Before committing, inspect staged changes and confirm `.env`,
`node_modules`, build output, credentials, and temporary test files are
excluded.

The original CloudVault project is maintained separately at
https://github.com/Vishal-san69/CloudVault.

## 17. Planned development roadmap

  Phase   Planned work                                            Status
  ------- ------------------------------------------------------- -------------
  1       Separate repositories and baseline                      Completed
  2       Verify local setup and baseline                         In progress
  3       EvidenceVault branding and architecture                 Planned
  4       Case management and database relationships              Planned
  5       Admin, Investigator, Viewer roles and case-level RBAC   Planned
  6       Audit trail and activity history                        Planned
  7       SHA-256 integrity verification                          Planned
  8       Document versioning and S3 versioning                   Planned
  9       AWS security, monitoring, backup and recovery           Planned
  10      Docker, EC2 deployment, testing and documentation       Planned

## 18. Troubleshooting

**Backend cannot connect to PostgreSQL** - Confirm PostgreSQL is
running. - Check `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and
`PGPASSWORD`. - Confirm the EvidenceVault database exists. - Do not
switch to or modify the CloudVault database as a workaround.

**AWS S3 access denied** - Check the AWS identity used by the backend. -
Verify bucket name and region. - Review IAM and bucket policies. - Do
not make the bucket public to solve access errors.

**Browser upload fails with a CORS error** - Confirm bucket CORS allows
the exact frontend origin. - Confirm required request headers are
allowed. - Confirm the presigned URL and upload headers match. - CORS
does not grant permission to access the bucket.

**Frontend cannot reach the backend** - Confirm the backend is running
on port 5000. - Confirm the frontend API base URL is
`http://localhost:5000/api`. - Confirm `CLIENT_URL` matches the frontend
origin.

**Missing npm script** - Run `npm run` in the relevant package
directory. - Use only scripts listed in that package's `package.json`.

## 19. Project scope and limitations

EvidenceVault is a portfolio and learning project inspired by a digital
evidence/document management problem statement. It is not an official
police or government system and is not certified for handling real
evidence or sensitive investigations.

Security controls, auditability, integrity verification, and deployment
features must be implemented and independently tested before being
described as production-ready.

## 20. Maintainer

**Developer:** Vishal Baviskar\
**GitHub:** https://github.com/Vishal-san69

------------------------------------------------------------------------

*Keep this README updated whenever setup commands, environment
variables, API endpoints, database schema, AWS configuration, or project
capabilities change.*

## Latest Development Update — 7 November 2026

### Case Request Response History

Implemented and tested persistent response history for professional reviews of client case requests.

**What was implemented**

- Created the `case_request_responses` PostgreSQL table.
- Added foreign keys linking response records to case requests and professionals.
- Added validation constraints for previous status, new status, and review actions.
- Added indexes for request-based and professional-based history retrieval.
- Updated the `reviewCaseRequest` controller to save every professional decision.
- Integrated response-history insertion into the existing database transaction.
- Preserved audit logging for case-request creation and review decisions.

### How It Works

When a professional reviews a client case request:

1. The API validates the request ID and review action.
2. The backend verifies that the professional owns the request.
3. PostgreSQL locks the request row using `FOR UPDATE`.
4. The case-request status is updated.
5. A response-history record is inserted into `case_request_responses`.
6. An audit-log entry is created in `audit_logs`.
7. All operations are committed together in one database transaction.

If an operation fails, the transaction is rolled back to prevent inconsistent records.

### Supported Review Actions

| Action | Resulting status |
|---|---|
| accept | accepted |
| reject | rejected |
| request_information | needs_information |

### API Endpoints Tested

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/case-requests` | Client submits a case request |
| GET | `/api/professionals` | Retrieve professional directory |
| GET | `/api/case-requests/received?status=pending` | Professional retrieves pending requests |
| PATCH | `/api/case-requests/:id/review` | Professional reviews a request |

### Database Verification

Verified the implementation directly in PostgreSQL.

**Response history verification:**
- Previous status: `pending`
- New status: `accepted`
- Action: `accept`
- Professional response message: Successfully stored.
- Timestamp: Automatically generated.

**Audit log verification:**
- `CASE_REQUEST_CREATED`
- `CASE_REQUEST_ACCEPTED`

Both events were confirmed in the `audit_logs` table.

### Testing Results

- Client case-request submission: Passed
- Professional directory retrieval: Passed
- Professional request retrieval: Passed
- Professional acceptance: Passed
- Response-history persistence: Passed
- Audit-log persistence: Passed
- PostgreSQL schema and constraints: Verified

### Next Development Tasks

1. Implement `GET /api/case-requests/:id/responses`.
2. Restrict response-history access to the owning client and assigned professional.
3. Test response-history retrieval and unauthorized access.
4. Continue formal case creation and administrator approval workflow.

**Current status:** Case-request creation, professional review, response-history persistence, and audit logging are implemented and tested.
