
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserX,
  XCircle,
} from "lucide-react";

import {
  getAdminAssignments,
  type AdminAssignmentRecord,
  type AdminAssignmentCounts,
} from "../../services/admin.service";

const emptyCounts: AdminAssignmentCounts = {
  pending_acceptance: 0,
  accepted: 0,
  declined: 0,
  revoked: 0,
};

const statusStyles: Record<string, string> = {
  pending_acceptance: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  accepted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  declined: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  revoked: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const formatStatus = (status: string) =>
  status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (date: string) => {
  if (!date) return "—";

  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const AdminAssignmentOverview = () => {
  const [assignments, setAssignments] = useState<AdminAssignmentRecord[]>([]);
  const [counts, setCounts] = useState<AdminAssignmentCounts>(emptyCounts);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadAssignments = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const data = await getAdminAssignments();

      setAssignments(data.assignments ?? []);
      setCounts(data.counts ?? emptyCounts);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Unable to load admin assignments:", err);
      setError("Unable to load assignments. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
  let cancelled = false;

  const initialize = async () => {
    try {
      const data = await getAdminAssignments();

      if (cancelled) return;

      setAssignments(data.assignments ?? []);
      setCounts(data.counts ?? emptyCounts);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Unable to load admin assignments:", err);

      if (!cancelled) {
        setError("Unable to load assignments. Please try again.");
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

  const filteredAssignments = assignments.filter((assignment) => {
    const matchesStatus =
      statusFilter === "all" || assignment.status === statusFilter;

    const searchText = search.toLowerCase();

    const matchesSearch = [
      assignment.case_number,
      assignment.case_title,
      assignment.professional_name,
      assignment.professional_email,
      assignment.role,
      assignment.status,
      assignment.assigned_by_name ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(searchText);

    return matchesStatus && matchesSearch;
  });

  const summaryCards = [
    {
      label: "Pending Acceptance",
      value: counts.pending_acceptance,
      icon: Clock,
      color: "text-amber-400",
      background: "bg-amber-500/10",
    },
    {
      label: "Accepted",
      value: counts.accepted,
      icon: CheckCircle2,
      color: "text-emerald-400",
      background: "bg-emerald-500/10",
    },
    {
      label: "Declined",
      value: counts.declined,
      icon: XCircle,
      color: "text-rose-400",
      background: "bg-rose-500/10",
    },
    {
      label: "Revoked",
      value: counts.revoked,
      icon: UserX,
      color: "text-slate-400",
      background: "bg-slate-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-purple-400" />
            <h2 className="text-2xl font-semibold text-white">
              Assignment Overview
            </h2>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Monitor professional assignments across all cases.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAssignments(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-lg shadow-black/10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {loading ? "—" : card.value}
                  </p>
                </div>

                <div className={`rounded-xl p-3 ${card.background}`}>
                  <Icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Assignment Records
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Showing {filteredAssignments.length} of {total} returned records
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search cases or professionals..."
                className="w-full rounded-xl border border-white/10 bg-[#171326] py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-gray-500 focus:border-purple-500 sm:w-64"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-[#171326] px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-purple-500"
            >
              <option value="all">All statuses</option>
              <option value="pending_acceptance">Pending acceptance</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
            <button
              type="button"
              onClick={() => void loadAssignments()}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading assignment records...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-4 font-medium">Case</th>
                  <th className="px-4 py-4 font-medium">Professional</th>
                  <th className="px-4 py-4 font-medium">Role</th>
                  <th className="px-4 py-4 font-medium">Status</th>
                  <th className="px-4 py-4 font-medium">Assigned By</th>
                  <th className="px-4 py-4 font-medium">Assigned At</th>
                  <th className="px-4 py-4 font-medium">Responded At</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {filteredAssignments.map((assignment) => (
                  <tr
                    key={assignment.id}
                    className="transition hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-4">
                      <p className="font-medium text-white">
                        {assignment.case_number}
                      </p>
                      <p className="mt-1 max-w-56 truncate text-xs text-gray-500">
                        {assignment.case_title}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-200">
                        {assignment.professional_name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {assignment.professional_email}
                      </p>
                    </td>

                    <td className="px-4 py-4 capitalize text-gray-300">
                      {assignment.role}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                          statusStyles[assignment.status] ??
                          "border-white/10 bg-white/5 text-gray-300"
                        }`}
                      >
                        {formatStatus(assignment.status)}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-gray-300">
                      {assignment.assigned_by_name ?? "Unavailable"}
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap text-gray-400">
                      {formatDate(assignment.assigned_at)}
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap text-gray-400">
                      {assignment.responded_at
                        ? formatDate(assignment.responded_at)
                        : "Awaiting response"}
                    </td>
                  </tr>
                ))}

                {filteredAssignments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center">
                      <Activity className="mx-auto mb-3 h-8 w-8 text-gray-600" />
                      <p className="font-medium text-gray-300">
                        No assignments found
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Try changing your search or status filter.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAssignmentOverview;
