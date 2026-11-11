
import api from "./api";

export type CaseStatus =
  | "pending_approval"
  | "active"
  | "changes_requested"
  | "rejected"
  | "closed";

export interface CaseRecord {
  id: string;
  case_number: string | null;
  title: string;
  description: string;
  status: CaseStatus | string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CaseApproval {
  id: string;
  status: string;
  comments: string | null;
  admin_id: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

export interface CaseDocument {
  id: string;
  case_id: string;
  user_id: string;
  original_name: string;
  content_type: string;
  file_size_bytes: number;
  status: string;
  created_at: string;
}

interface CasesResponse {
  success: boolean;
  total: number;
  cases: CaseRecord[];
}

interface CaseDetailsResponse {
  success: boolean;
  case: CaseRecord;
  approval: CaseApproval | null;
}

interface CaseDocumentsResponse {
  success: boolean;
  documents: CaseDocument[];
}

interface DownloadResponse {
  success: boolean;
  message: string;
  download_url: string;
  filename: string;
  expires_in: number;
}

export const getCases = async (): Promise<CaseRecord[]> => {
  const response = await api.get<CasesResponse>("/cases");

  return response.data.cases ?? [];
};

export const getCaseById = async (
  caseId: string
): Promise<CaseDetailsResponse> => {
  const response = await api.get<CaseDetailsResponse>(
    `/cases/${caseId}`
  );

  return response.data;
};

export const getCaseDocuments = async (
  caseId: string
): Promise<CaseDocument[]> => {
  const response = await api.get<CaseDocumentsResponse>(
    `/documents/cases/${caseId}`
  );

  return response.data.documents ?? [];
};

export const downloadCaseDocument = async (
  documentId: string
): Promise<DownloadResponse> => {
  const response = await api.get<DownloadResponse>(
    `/documents/${documentId}/download-url`
  );

  return response.data;
};
