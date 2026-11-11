
import api from "./api";

export type AssignmentStatus =
  | "pending_acceptance"
  | "accepted"
  | "declined"
  | "revoked";

export interface ProfessionalAssignment {
  id: string;
  case_id: string;
  professional_id: string;
  assigned_by: string;
  role: "lawyer" | "investigator";
  status: AssignmentStatus;
  assigned_at: string;
  responded_at: string | null;
  updated_at: string;
}

interface AssignmentsResponse {
  success: boolean;
  total: number;
  assignments: ProfessionalAssignment[];
}

interface AssignmentResponse {
  success: boolean;
  message: string;
  assignment: ProfessionalAssignment;
}

export const getMyAssignments = async (): Promise<ProfessionalAssignment[]> => {
  const response = await api.get<AssignmentsResponse>(
    "/professionals/assignments"
  );

  return response.data.assignments ?? [];
};

export const respondToAssignment = async (
  assignmentId: string,
  action: "accept" | "reject"
): Promise<AssignmentResponse> => {
  const response = await api.patch<AssignmentResponse>(
    `/professionals/assignments/${assignmentId}/respond`,
    { action }
  );

  return response.data;
};
