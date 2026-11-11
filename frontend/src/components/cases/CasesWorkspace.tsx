
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";

import {
  downloadCaseDocument,
  getCaseById,
  getCaseDocuments,
  getCases,
  type CaseDocument,
  type CaseRecord,
} from "../../services/case.service";
import { uploadCaseDocument } from "../../services/document.service";

const formatDate = (value: string) => {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 Bytes";
  }

  const units = ["Bytes", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / Math.pow(1024, index)).toFixed(
    index === 0 ? 0 : 2
  )} ${units[index]}`;
};

const statusStyles: Record<string, string> = {
  active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  pending_approval:
    "border-amber-500/20 bg-amber-500/10 text-amber-300",
  changes_requested:
    "border-orange-500/20 bg-orange-500/10 text-orange-300",
  rejected: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  closed: "border-slate-500/20 bg-slate-500/10 text-slate-300",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  pending_approval: "Pending approval",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  closed: "Closed",
};

export default function CasesWorkspace() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCase, setSelectedCase] =
    useState<CaseRecord | null>(null);

  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDocument, setBusyDocument] = useState<string | null>(
    null
  );

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [message, setMessage] = useState("");

  const loadCases = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");
    setMessage("");

    try {
      const data = await getCases();
      setCases(data);
    } catch {
      setError(
        "Unable to load your cases. Please try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchCases = async () => {
      try {
        const data = await getCases();

        if (isMounted) {
          setCases(data);
        }
      } catch {
        if (isMounted) {
          setError(
            "Unable to load your cases. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchCases();

    return () => {
      isMounted = false;
    };
  }, []);

  const openCase = async (caseId: string) => {
    setSelectedCase(null);
    setDocuments([]);
    setDetailLoading(true);
    setDetailError("");
    setMessage("");

    try {
      const [caseResponse, documentData] = await Promise.all([
        getCaseById(caseId),
        getCaseDocuments(caseId),
      ]);

      setSelectedCase(caseResponse.case);
      setDocuments(documentData);
    } catch {
      setDetailError(
        "Unable to retrieve case details or evidence documents. Check your access and try again."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDownload = async (document: CaseDocument) => {
    setBusyDocument(document.id);
    setDetailError("");
    setMessage("");

    try {
      const result = await downloadCaseDocument(document.id);

      const link = window.document.createElement("a");
      link.href = result.download_url;
      link.download = result.filename || document.original_name;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      window.document.body.appendChild(link);
      link.click();
      link.remove();

      setMessage(
        `${document.original_name}: download started.`
      );
    } catch {
      setDetailError(
        "Unable to download this document. You may no longer have access."
      );
    } finally {
      setBusyDocument(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedCase || uploading) {
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setDetailError("");
    setMessage("");

    try {
      await uploadCaseDocument(
        selectedFile,
        selectedCase.id,
        ({ loaded, total }) => {
          if (total > 0) {
            setUploadProgress(Math.round((loaded / total) * 100));
          }
        }
      );

      setMessage(
        `${selectedFile.name} uploaded and verified successfully.`
      );
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      try {
        const updatedDocuments = await getCaseDocuments(selectedCase.id);
        setDocuments(updatedDocuments);
      } catch {
        setDetailError(
          "The upload was verified, but the evidence list could not be refreshed. Use Refresh or reopen this case."
        );
      }
    } catch (error) {
      console.error("Case document upload error:", error);
      setDetailError(
        error instanceof Error
          ? error.message
          : "Unable to upload the document. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="neu-panel flex items-center justify-center gap-3 p-10 text-sm text-[var(--text-secondary)]">
        <Loader2
          size={20}
          className="animate-spin text-[var(--accent)]"
        />
        Loading your cases...
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div className="neu-panel flex items-center justify-center gap-3 p-10 text-sm text-[var(--text-secondary)]">
        <Loader2
          size={20}
          className="animate-spin text-[var(--accent)]"
        />
        Loading case details and evidence...
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {!selectedCase ? (
        <>
          <div className="neu-panel flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center md:p-7">
            <div>
              <h3 className="text-xl font-semibold">
                My Cases
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                View cases assigned to you and access authorized evidence.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadCases(true)}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="neu-panel p-5">
              <p className="text-sm text-[var(--text-secondary)]">
                Accessible cases
              </p>
              <p className="mt-2 text-3xl font-bold">
                {cases.length}
              </p>
            </div>

            <div className="neu-panel p-5">
              <p className="text-sm text-[var(--text-secondary)]">
                Active cases
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-300">
                {cases.filter((item) => item.status === "active").length}
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300"
            >
              <AlertCircle size={18} className="shrink-0" />
              {error}
            </div>
          )}

          {cases.length === 0 ? (
            <div className="neu-panel flex flex-col items-center p-10 text-center">
              <FolderOpen
                size={40}
                className="mb-4 text-[var(--text-muted)]"
              />
              <h4 className="font-semibold">
                No accessible cases
              </h4>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Cases will appear here after you accept an assignment.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {cases.map((item) => (
                <article
                  key={item.id}
                  className="neu-panel space-y-5 p-5 md:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Case reference
                      </p>

                      <p className="mt-2 break-all font-mono text-sm">
                        {item.case_number || item.id}
                      </p>
                    </div>

                    <span
                      className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                        statusStyles[item.status] ||
                        "border-slate-500/20 bg-slate-500/10 text-slate-300"
                      }`}
                    >
                      {statusLabels[item.status] || item.status}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold">
                      {item.title}
                    </h4>

                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 border-t border-white/[0.06] pt-4 text-xs text-[var(--text-muted)]">
                    <CalendarDays size={15} />
                    Assigned case created on {formatDate(item.created_at)}
                  </div>

                  <button
                    type="button"
                    onClick={() => void openCase(item.id)}
                    className="neu-button neu-button-primary w-full"
                  >
                    <FolderOpen size={17} />
                    Open case
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="neu-panel space-y-5 p-5 md:p-7">
            <button
              type="button"
              onClick={() => {
                setSelectedCase(null);
                setDocuments([]);
                setDetailError("");
                setMessage("");
              }}
              className="neu-button"
            >
              <ArrowLeft size={17} />
              Back to cases
            </button>

            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Case reference
                </p>

                <p className="mt-2 break-all font-mono text-sm">
                  {selectedCase.case_number || selectedCase.id}
                </p>

                <h3 className="mt-4 text-2xl font-bold">
                  {selectedCase.title}
                </h3>
              </div>

              <span
                className={`w-fit rounded-full border px-3 py-1.5 text-xs font-medium ${
                  statusStyles[selectedCase.status] ||
                  "border-slate-500/20 bg-slate-500/10 text-slate-300"
                }`}
              >
                {statusLabels[selectedCase.status] ||
                  selectedCase.status}
              </span>
            </div>

            <div className="border-t border-white/[0.06] pt-5">
              <h4 className="font-semibold">Case description</h4>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
                {selectedCase.description}
              </p>
            </div>

            <div className="grid gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[var(--text-muted)]">
                  Created on
                </p>
                <p className="mt-1 text-sm">
                  {formatDate(selectedCase.created_at)}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--text-muted)]">
                  Last updated
                </p>
                <p className="mt-1 text-sm">
                  {formatDate(selectedCase.updated_at)}
                </p>
              </div>
            </div>
          </div>

          <div className="neu-panel space-y-5 p-5 md:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h4 className="text-xl font-semibold">
                  Case evidence
                </h4>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Documents authorized for this case.
                </p>
              </div>

              <span className="text-sm text-[var(--text-muted)]">
                {documents.length}{" "}
                {documents.length === 1 ? "document" : "documents"}
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.05] p-3 text-xs text-emerald-300">
              <ShieldCheck size={17} />
              Access verified by the EvidenceVault API.
            </div>

            <div className="neu-inset space-y-4 rounded-xl p-4">
              <div>
                <h5 className="font-semibold">Upload case evidence</h5>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Upload supporting documents securely to this case. Maximum file size: 10 MB.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setDetailError("");
                  setMessage("");
                  setUploadProgress(0);

                  if (!file) {
                    setSelectedFile(null);
                    return;
                  }

                  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
                    setSelectedFile(null);
                    event.target.value = "";
                    setDetailError("Choose a file larger than 0 bytes and no larger than 10 MB.");
                    return;
                  }

                  setSelectedFile(file);
                }}
                className="block w-full text-sm text-[var(--text-secondary)] file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--accent-glow)] file:px-4 file:py-2 file:font-medium file:text-[var(--accent-light)] hover:file:opacity-80 disabled:opacity-50"
              />

              {selectedFile && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="break-all">Selected: {selectedFile.name}</span>
                  <span>{formatBytes(selectedFile.size)}</span>
                </div>
              )}

              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>Uploading and verifying...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-label="Document upload progress"
                    aria-valuenow={uploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={!selectedFile || uploading}
                className="neu-button neu-button-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={17} />
                    Upload document
                  </>
                )}
              </button>
            </div>

            {detailError && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300"
              >
                <AlertCircle size={18} className="shrink-0" />
                {detailError}
              </div>
            )}

            {message && (
              <p
                role="status"
                className="text-sm text-emerald-300"
              >
                {message}
              </p>
            )}

            {documents.length === 0 ? (
              <div className="neu-inset flex flex-col items-center rounded-xl p-9 text-center">
                <FileText
                  size={34}
                  className="mb-3 text-[var(--text-muted)]"
                />
                <p className="font-semibold">
                  No evidence documents
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  No active documents have been uploaded to this case.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((document) => {
                  const isBusy = busyDocument === document.id;

                  return (
                    <article
                      key={document.id}
                      className="neu-inset flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-glow)] text-[var(--accent-light)]">
                        <FileText size={21} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold">
                          {document.original_name}
                        </p>

                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          {formatBytes(
                            Number(document.file_size_bytes)
                          )}{" "}
                          · {formatDate(document.created_at)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDownload(document)}
                        disabled={isBusy}
                        className="neu-button shrink-0 disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2
                            size={17}
                            className="animate-spin"
                          />
                        ) : (
                          <Download size={17} />
                        )}
                        Download
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
