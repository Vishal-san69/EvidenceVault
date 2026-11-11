
import api from "./api";
import type { CaseRecord } from "./case.service";

export interface Professional {
  id: string;
  full_name: string;
  email: string;
  role: "lawyer" | "investigator";
  created_at: string;
}

export interface AdminAssignment {
  id: string;
  case_id: string;
  professional_id: string;
  assigned_by: string;
  role: "lawyer" | "investigator";
  status: "pending_acceptance" | "accepted" | "declined" | "revoked";
  assigned_at: string;
  responded_at: string | null;
  updated_at: string;
}

interface ProfessionalsResponse {
  success: boolean;
  professionals: Professional[];
}

interface AssignmentResponse {
  success: boolean;
  message: string;
  assignment: AdminAssignment;
}

export const getAdminProfessionals = async (): Promise<Professional[]> => {
  const response = await api.get<ProfessionalsResponse>(
    "/admin/professionals"
  );

  return response.data.professionals ?? [];
};

export const getAdminCases = async (): Promise<CaseRecord[]> => {
  const response = await api.get<{ success: boolean; total: number; cases: CaseRecord[] }>(
    "/cases"
  );

  return response.data.cases ?? [];
};

export const assignProfessionalToCase = async (
  caseId: string,
  professionalId: string
): Promise<AssignmentResponse> => {
  const response = await api.post<AssignmentResponse>(
    `/admin/cases/${caseId}/assign`,
    { professional_id: professionalId }
  );

  return response.data;
};
export interface AdminAssignmentRecord {
  id: string;
  case_id: string;
  professional_id: string;
  assigned_by: string;
  role: "lawyer" | "investigator";
  status: "pending_acceptance" | "accepted" | "declined" | "revoked";
  assigned_at: string;
  responded_at: string | null;
  updated_at: string;

  case_number: string;
  case_title: string;
  case_status: string;

  professional_name: string;
  professional_email: string;

  assigned_by_name: string | null;
  assigned_by_email: string | null;
}

export interface AdminAssignmentCounts {
  pending_acceptance: number;
  accepted: number;
  declined: number;
  revoked: number;
}

export interface AdminAssignmentsResponse {
  success: boolean;
  total: number;
  counts: AdminAssignmentCounts;
  assignments: AdminAssignmentRecord[];
}

export const getAdminAssignments = async () => {
  const response = await api.get<AdminAssignmentsResponse>(
    "/admin/assignments"
  );

  return response.data;
};