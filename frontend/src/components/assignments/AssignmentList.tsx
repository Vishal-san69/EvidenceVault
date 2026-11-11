
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";

import {
  getMyAssignments,
  respondToAssignment,
  type AssignmentStatus,
  type ProfessionalAssignment,
} from "../../services/professional.service";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const statusStyles: Record<AssignmentStatus, string> = {
  pending_acceptance:
    "border-amber-500/20 bg-amber-500/10 text-amber-300",
  accepted:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  declined:
    "border-rose-500/20 bg-rose-500/10 text-rose-300",
  revoked:
    "border-slate-500/20 bg-slate-500/10 text-slate-300",
};

const statusLabels: Record<AssignmentStatus, string> = {
  pending_acceptance: "Pending acceptance",
  accepted: "Accepted",
  declined: "Declined",
  revoked: "Revoked",
};

export default function AssignmentList() {
  const [assignments, setAssignments] = useState<
    ProfessionalAssignment[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAssignment, setBusyAssignment] = useState<string | null>(
    null
  );

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Fetch assignments from the backend.
  const loadAssignments = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      setMessage("");

      try {
        const data = await getMyAssignments();
        setAssignments(data);
      } catch {
        setError(
          "Unable to load assignments. Please try again."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  // Initial assignment loading.
  useEffect(() => {
    let isMounted = true;

    const fetchAssignments = async () => {
      try {
        const data = await getMyAssignments();

        if (isMounted) {
          setAssignments(data);
        }
      } catch {
        if (isMounted) {
          setError(
            "Unable to load assignments. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchAssignments();

    return () => {
      isMounted = false;
    };
  }, []);

  // Accept or reject an assignment.
  const handleResponse = async (
    assignment: ProfessionalAssignment,
    action: "accept" | "reject"
  ) => {
    const actionLabel =
      action === "accept" ? "accept" : "reject";

    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel} this case assignment?`
    );

    if (!confirmed) {
      return;
    }

    setBusyAssignment(assignment.id);
    setError("");
    setMessage("");

    try {
      const result = await respondToAssignment(
        assignment.id,
        action
      );

      setAssignments((current) =>
        current.map((item) =>
          item.id === assignment.id
            ? result.assignment
            : item
        )
      );

      setMessage(
        result.message ||
          `Assignment ${actionLabel}ed successfully.`
      );
    } catch {
      setError(
        `Unable to ${actionLabel} this assignment. Please refresh and try again.`
      );
    } finally {
      setBusyAssignment(null);
    }
  };

  const pendingCount = assignments.filter(
    (item) => item.status === "pending_acceptance"
  ).length;

  const acceptedCount = assignments.filter(
    (item) => item.status === "accepted"
  ).length;

  // Initial loading screen.
  if (loading) {
    return (
      <div className="neu-panel flex items-center justify-center gap-3 p-10 text-sm text-[var(--text-secondary)]">
        <Loader2
          className="animate-spin text-[var(--accent)]"
          size={20}
        />
        Loading your assignments...
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Page heading and refresh button */}
      <div className="neu-panel flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center md:p-7">
        <div>
          <h3 className="text-xl font-semibold">
            My Assignments
          </h3>

          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Review and manage your assigned cases.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAssignments(true)}
          disabled={refreshing}
          className="neu-button"
        >
          <RefreshCw
            size={17}
            className={refreshing ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {/* Assignment statistics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="neu-panel p-5">
          <p className="text-sm text-[var(--text-secondary)]">
            Pending assignments
          </p>

          <p className="mt-2 text-3xl font-bold text-amber-300">
            {pendingCount}
          </p>
        </div>

        <div className="neu-panel p-5">
          <p className="text-sm text-[var(--text-secondary)]">
            Accepted assignments
          </p>

          <p className="mt-2 text-3xl font-bold text-emerald-300">
            {acceptedCount}
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300"
        >
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
          />
          {error}
        </div>
      )}

      {/* Success message */}
      {message && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"
        >
          <CheckCircle2
            size={18}
            className="mt-0.5 shrink-0"
          />
          {message}
        </div>
      )}

      {/* Empty state */}
      {assignments.length === 0 ? (
        <div className="neu-panel flex flex-col items-center p-10 text-center">
          <ClipboardList
            size={38}
            className="mb-4 text-[var(--text-muted)]"
          />

          <h4 className="font-semibold">
            No assignments yet
          </h4>

          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            New case assignments will appear here.
          </p>
        </div>
      ) : (
        /* Assignment cards */
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const isBusy =
              busyAssignment === assignment.id;

            const isPending =
              assignment.status === "pending_acceptance";

            return (
              <article
                key={assignment.id}
                className="neu-panel space-y-5 p-5 md:p-6"
              >
                {/* Case reference and status */}
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Case reference
                    </p>

                    <p className="mt-2 break-all font-mono text-sm text-[var(--text-primary)]">
                      {assignment.case_id}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full border px-3 py-1.5 text-xs font-medium ${
                      statusStyles[assignment.status]
                    }`}
                  >
                    {statusLabels[assignment.status]}
                  </span>
                </div>

                {/* Assignment details */}
                <div className="grid gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">
                      Assigned on
                    </p>

                    <p className="mt-1 text-sm">
                      {formatDate(assignment.assigned_at)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--text-muted)]">
                      Your role
                    </p>

                    <p className="mt-1 text-sm capitalize">
                      {assignment.role}
                    </p>
                  </div>
                </div>

                {/* Pending assignment actions */}
                {isPending && (
                  <div className="flex flex-wrap gap-3 border-t border-white/[0.06] pt-4">
                    <button
                      type="button"
                      onClick={() =>
                        void handleResponse(
                          assignment,
                          "accept"
                        )
                      }
                      disabled={isBusy}
                      className="neu-button neu-button-primary"
                    >
                      {isBusy ? (
                        <Loader2
                          size={17}
                          className="animate-spin"
                        />
                      ) : (
                        <CheckCircle2 size={17} />
                      )}

                      Accept assignment
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleResponse(
                          assignment,
                          "reject"
                        )
                      }
                      disabled={isBusy}
                      className="neu-button"
                    >
                      {isBusy ? (
                        <Loader2
                          size={17}
                          className="animate-spin"
                        />
                      ) : (
                        <XCircle size={17} />
                      )}

                      Reject assignment
                    </button>
                  </div>
                )}

                {/* Accepted assignment information */}
                {assignment.status === "accepted" && (
                  <p className="border-t border-white/[0.06] pt-4 text-sm text-emerald-300">
                    This assignment is accepted. Case access
                    remains subject to server-side authorization.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
