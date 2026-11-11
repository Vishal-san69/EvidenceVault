

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, RefreshCw, UserRound, Users } from "lucide-react";
import { isAxiosError } from "axios";
import {
  assignProfessionalToCase,
  getAdminCases,
  getAdminProfessionals,
  type Professional,
} from "../../services/admin.service";
import type { CaseRecord } from "../../services/case.service";

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || "The request could not be completed.";
  }

  return error instanceof Error ? error.message : "Something went wrong.";
};

export default function AdminAssignments() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedCase, setSelectedCase] = useState("");
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "lawyer" | "investigator">("all");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const assignableCases = useMemo(
    () => cases.filter((item) => ["active", "changes_requested"].includes(item.status)),
    [cases]
  );

  const filteredProfessionals = useMemo(
    () =>
      professionals.filter(
        (professional) =>
          roleFilter === "all" || professional.role === roleFilter
      ),
    [professionals, roleFilter]
  );

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [caseRecords, professionalRecords] = await Promise.all([
        getAdminCases(),
        getAdminProfessionals(),
      ]);

      setCases(caseRecords);
      setProfessionals(professionalRecords);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
  let cancelled = false;

  const initialize = async () => {
    try {
      const [caseRecords, professionalRecords] = await Promise.all([
        getAdminCases(),
        getAdminProfessionals(),
      ]);

      if (!cancelled) {
        setCases(caseRecords);
        setProfessionals(professionalRecords);
      }
    } catch (loadError) {
      if (!cancelled) {
        setError(getErrorMessage(loadError));
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  };

  void initialize();

  return () => {
    cancelled = true;
  };
}, []);
  const handleRoleChange = (value: "all" | "lawyer" | "investigator") => {
    setRoleFilter(value);
    setSelectedProfessional("");
  };

  const handleAssign = async () => {
    if (!selectedCase || !selectedProfessional) {
      setError("Select a case and a professional before assigning.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const result = await assignProfessionalToCase(
        selectedCase,
        selectedProfessional
      );

      setSuccess(result.message || "Assignment created successfully.");
      setSelectedProfessional("");
      await loadData();
    } catch (assignError) {
      setError(getErrorMessage(assignError));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="neu-panel flex items-center justify-center gap-3 p-12 text-sm text-[var(--text-secondary)]">
        <Loader2 className="animate-spin text-[var(--accent-light)]" size={20} />
        Loading assignment data...
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="neu-panel flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center md:p-8">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent-light)]">
            <ClipboardList size={16} />
            Administration
          </div>
          <h2 className="text-2xl font-bold">Professional Assignments</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Assign eligible lawyers and investigators to active cases.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading || submitting}
          className="neu-button flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="neu-panel flex items-center gap-4 p-5">
          <div className="neu-inset flex h-12 w-12 items-center justify-center rounded-xl text-[var(--accent-light)]">
            <FolderIcon />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Assignable cases</p>
            <p className="mt-1 text-2xl font-bold">{assignableCases.length}</p>
          </div>
        </div>

        <div className="neu-panel flex items-center gap-4 p-5">
          <div className="neu-inset flex h-12 w-12 items-center justify-center rounded-xl text-[var(--accent-light)]">
            <Users size={21} />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">Registered professionals</p>
            <p className="mt-1 text-2xl font-bold">{professionals.length}</p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="neu-panel flex items-start gap-3 border border-[var(--danger)]/30 p-4 text-sm text-[var(--danger)]">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div role="status" className="neu-panel flex items-start gap-3 border border-[var(--success)]/30 p-4 text-sm text-[var(--success)]">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          {success}
        </div>
      )}

      <div className="neu-panel space-y-6 p-5 md:p-7">
        <div>
          <h3 className="text-lg font-semibold">Create an assignment</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            The selected professional must accept the assignment before receiving case access.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="assignment-case" className="text-sm font-medium">
            Select case
          </label>
          <select
            id="assignment-case"
            value={selectedCase}
            onChange={(event) => setSelectedCase(event.target.value)}
            className="neu-inset w-full rounded-xl border border-white/5 bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">Choose an active or changes-requested case</option>
            {assignableCases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.case_number ? `${item.case_number} — ` : ""}
                {item.title} ({item.status.replaceAll("_", " ")})
              </option>
            ))}
          </select>
          {assignableCases.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              No cases are currently eligible for assignment.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="assignment-role" className="text-sm font-medium">
            Professional type
          </label>
          <select
            id="assignment-role"
            value={roleFilter}
            onChange={(event) =>
              handleRoleChange(event.target.value as "all" | "lawyer" | "investigator")
            }
            className="neu-inset w-full rounded-xl border border-white/5 bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All professionals</option>
            <option value="lawyer">Lawyers</option>
            <option value="investigator">Investigators</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="assignment-professional" className="text-sm font-medium">
            Select professional
          </label>
          <select
            id="assignment-professional"
            value={selectedProfessional}
            onChange={(event) => setSelectedProfessional(event.target.value)}
            className="neu-inset w-full rounded-xl border border-white/5 bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">Choose a professional</option>
            {filteredProfessionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.full_name} — {professional.role}
              </option>
            ))}
          </select>
          {filteredProfessionals.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              No professionals found for this selection.
            </p>
          )}
        </div>

        {selectedProfessional && (
          <div className="neu-inset flex items-center gap-3 rounded-xl p-4">
            <UserRound size={20} className="text-[var(--accent-light)]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {professionals.find((person) => person.id === selectedProfessional)?.full_name}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                {professionals.find((person) => person.id === selectedProfessional)?.email}
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleAssign()}
          disabled={submitting || !selectedCase || !selectedProfessional}
          className="neu-button neu-button-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={17} className="animate-spin" />
              Creating assignment...
            </>
          ) : (
            <>
              <ClipboardList size={17} />
              Assign professional
            </>
          )}
        </button>
      </div>
    </section>
  );
}

function FolderIcon() {
  return <ClipboardList size={21} />;
}
