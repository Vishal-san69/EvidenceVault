
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  PieChart,
  Bell,
  CheckCircle2,
  Cloud,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Files,
  HardDrive,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { isAxiosError } from "axios";
import api from "./services/api";

type User = {
  id: string;
  full_name: string;
  email: string;
  role?: string;
};

type DocumentRecord = {
  id: string;
  original_name: string;
  content_type: string;
  file_size_bytes: number;
  status: string;
  created_at: string;
};

type Notice = {
  type: "success" | "error";
  message: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const getFileIcon = (contentType: string) => {
  if (contentType.startsWith("image/")) return FileImage;
  if (contentType.includes("spreadsheet")) return FileSpreadsheet;
  return FileText;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activePage, setActivePage] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyDocument, setBusyDocument] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotice = (type: Notice["type"], message: string) => {
    setNotice({ type, message });
    window.setTimeout(() => setNotice(null), 4500);
  };

  const loadDocuments = useCallback(async (): Promise<DocumentRecord[]> => {
    const response = await api.get<{ documents?: DocumentRecord[] }>(
      "/documents/my-documents",
    );

    return response.data.documents ?? [];
  }, []);

  const loadCurrentUser = useCallback(async () => {
    const response = await api.get("/auth/me");
    setUser(response.data.user);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const token = localStorage.getItem("evidencevault_token");

      if (!token) {
        setPageLoading(false);
        return;
      }

      try {
        await loadCurrentUser();
      } catch {
        localStorage.removeItem("evidencevault_token");
        setUser(null);
      } finally {
        setPageLoading(false);
      }
    };

    void initialize();
  }, [loadCurrentUser]);

  useEffect(() => {
    if (!user) return;

    let isActive = true;

    void loadDocuments()
      .then((result) => {
        if (isActive) {
          setDocuments(result);
        }
      })
      .catch(() => {
        if (isActive) {
          showNotice("error", "Unable to load your documents.");
        }
      });

    return () => {
      isActive = false;
    };
  }, [user, loadDocuments]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);

    try {
      if (authMode === "register") {
        await api.post("/auth/register", {
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        });
      }

      const response = await api.post("/auth/login", {
        email: email.trim(),
        password,
      });

      localStorage.setItem("evidencevault_token", response.data.token);
      await loadCurrentUser();

      setPassword("");
      showNotice(
        "success",
        authMode === "register"
          ? "Your EvidenceVault account has been created."
          : "Welcome back to EvidenceVault.",
      );
    } catch (error: unknown) {
      const fallback =
        authMode === "register"
          ? "Unable to create your account."
          : "Login failed. Check your credentials.";

      showNotice("error", getErrorMessage(error, fallback));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("evidencevault_token");
    setUser(null);
    setDocuments([]);
    setActivePage("Dashboard");
    setPassword("");
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;

    const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const expectedType = ALLOWED_TYPES[extension];

    if (!expectedType || expectedType !== file.type) {
      showNotice("error", "This file format is not supported.");
      return;
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      showNotice("error", "File size must be between 1 byte and 10 MB.");
      return;
    }

    setUploading(true);

    try {
      const response = await api.post("/documents/upload-url", {
        original_name: file.name,
        content_type: file.type,
        file_size_bytes: file.size,
      });

      const { upload_url, document } = response.data;

      const uploadResponse = await fetch(upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "x-amz-server-side-encryption": "AES256",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `S3 upload failed with status ${uploadResponse.status}.`,
        );
      }

      await api.post(`/documents/${document.id}/confirm`);
      setDocuments(await loadDocuments());

      showNotice("success", `${file.name} uploaded successfully.`);
    } catch (error: unknown) {
      console.error("Document upload error:", error);

      showNotice(
        "error",
        getErrorMessage(error, "Upload failed. Please try again."),
      );
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = async (document: DocumentRecord) => {
    setBusyDocument(document.id);

    try {
      const response = await api.get(
        `/documents/${document.id}/download-url`,
      );

      const link = window.document.createElement("a");
      link.href = response.data.download_url;
      link.download = document.original_name;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      window.document.body.appendChild(link);
      link.click();
      link.remove();

      showNotice("success", "Your download has started.");
    } catch (error: unknown) {
      showNotice(
        "error",
        getErrorMessage(error, "Unable to download this document."),
      );
    } finally {
      setBusyDocument(null);
    }
  };

  const handleDelete = async (document: DocumentRecord) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${document.original_name}"?`,
    );

    if (!confirmed) return;

    setBusyDocument(document.id);

    try {
      await api.delete(`/documents/${document.id}`);
      setDocuments(await loadDocuments());
      showNotice("success", "Document deleted successfully.");
    } catch (error: unknown) {
      showNotice(
        "error",
        getErrorMessage(error, "Unable to delete this document."),
      );
    } finally {
      setBusyDocument(null);
    }
  };

  const filteredDocuments = useMemo(() => {
    const filtered = documents.filter((document) => {
      const matchesSearch = document.original_name
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      const extension = document.original_name
        .slice(document.original_name.lastIndexOf("."))
        .toLowerCase();

      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "images" && document.content_type.startsWith("image/")) ||
        (typeFilter === "pdf" && extension === ".pdf") ||
        (typeFilter === "documents" &&
          [".docx", ".txt"].includes(extension)) ||
        (typeFilter === "spreadsheets" && extension === ".xlsx");

      return matchesSearch && matchesType;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === "name-asc") {
        return a.original_name.localeCompare(b.original_name);
      }
      if (sortBy === "name-desc") {
        return b.original_name.localeCompare(a.original_name);
      }
      if (sortBy === "largest") {
        return Number(b.file_size_bytes) - Number(a.file_size_bytes);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [documents, search, typeFilter, sortBy]);

  const totalStorage = documents.reduce(
    (total, document) => total + Number(document.file_size_bytes),
    0,
  );

  const storageAnalytics = useMemo(() => {
    const groups = [
      { key: "pdf", label: "PDF files", color: "#8278ff", count: 0, bytes: 0 },
      { key: "images", label: "Images", color: "#48b8d1", count: 0, bytes: 0 },
      { key: "documents", label: "Documents", color: "#55c99a", count: 0, bytes: 0 },
      { key: "spreadsheets", label: "Spreadsheets", color: "#e9b96e", count: 0, bytes: 0 },
      { key: "other", label: "Other", color: "#d27bdc", count: 0, bytes: 0 },
    ];

    documents.forEach((document) => {
      const extension = document.original_name
        .slice(document.original_name.lastIndexOf("."))
        .toLowerCase();
      const group =
        extension === ".pdf"
          ? groups[0]
          : document.content_type.startsWith("image/")
            ? groups[1]
            : [".docx", ".txt"].includes(extension)
              ? groups[2]
              : extension === ".xlsx"
                ? groups[3]
                : groups[4];

      group.count += 1;
      group.bytes += Number(document.file_size_bytes) || 0;
    });

    let offset = 0;
    const segments = groups
      .filter((group) => group.bytes > 0)
      .map((group) => {
        const start = offset;
        offset += totalStorage > 0 ? (group.bytes / totalStorage) * 100 : 0;
        return `${group.color} ${start}% ${offset}%`;
      });

    return {
      groups,
      chartBackground:
        segments.length > 0
          ? `conic-gradient(${segments.join(", ")})`
          : "conic-gradient(#34394a 0% 100%)",
      largest: [...documents]
        .sort(
          (a, b) =>
            Number(b.file_size_bytes) - Number(a.file_size_bytes),
        )
        .slice(0, 5),
      recent: [...documents]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )
        .slice(0, 5),
    };
  }, [documents, totalStorage]);

  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "My Documents", icon: Files },
    { name: "Storage Analytics", icon: PieChart },
    { name: "Security Activity", icon: Activity },
    { name: "Settings", icon: Settings },
  ];

  if (pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
        <div className="neu-panel flex items-center gap-3 px-7 py-5 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-[var(--accent)]" />
          Loading EvidenceVault...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-9 text-center">
            <div className="neu-panel mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl">
              <ShieldCheck size={39} className="text-[var(--accent-light)]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              EvidenceVault <span className="text-[var(--accent)]">AI</span>
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Your private space in the cloud.
            </p>
          </div>

          <form onSubmit={handleLogin} className="neu-panel space-y-5 p-7 sm:p-9">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-light)]">
                Secure access
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {authMode === "login" ? "Welcome back" : "Create account"}
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {authMode === "login"
                  ? "Sign in to access your document vault."
                  : "Create your secure document workspace."}
              </p>
            </div>

            {authMode === "register" && (
              <div>
                <label className="mb-2 block text-sm text-[var(--text-secondary)]">
                  Full name
                </label>
                <input
                  className="neu-input"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Enter your full name"
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm text-[var(--text-secondary)]">
                Email address
              </label>
              <input
                className="neu-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[var(--text-secondary)]">
                Password
              </label>
              <div className="relative">
                <input
                  className="neu-input pr-12"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  minLength={8}
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-white"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <X size={18} /> : <LockKeyhole size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="neu-button neu-button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ShieldCheck size={18} />
              )}
              {authLoading
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in securely"
                  : "Create account"}
            </button>

            <div className="text-center text-sm text-[var(--text-secondary)]">
              {authMode === "login"
                ? "New to EvidenceVault? "
                : "Already have an account? "}
              <button
                type="button"
                onClick={() =>
                  setAuthMode(authMode === "login" ? "register" : "login")
                }
                className="font-semibold text-[var(--accent-light)] hover:text-white"
              >
                {authMode === "login" ? "Create account" : "Sign in"}
              </button>
            </div>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <LockKeyhole size={13} />
            Protected access · Encrypted cloud storage
          </div>
        </div>

        {notice && <NoticeToast notice={notice} />}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] md:flex">
      {mobileMenu && (
        <button
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileMenu(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/[0.025] bg-[var(--bg-primary)] p-6 transition-transform duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          mobileMenu ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-12 flex items-center gap-3">
          <div className="neu-panel flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
            <ShieldCheck size={25} className="text-[var(--accent-light)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">EvidenceVault</h1>
            <p className="text-xs text-[var(--text-muted)]">Secure cloud storage</p>
          </div>
          <button
            className="ml-auto text-[var(--text-secondary)] md:hidden"
            onClick={() => setMobileMenu(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
          Workspace
        </p>

        <nav className="space-y-3">
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => {
                setActivePage(name);
                setMobileMenu(false);
              }}
              className={`neu-nav-item ${activePage === name ? "active" : ""}`}
            >
              <Icon size={19} />
              <span className="text-sm font-medium">{name}</span>
            </button>
          ))}
        </nav>

        <div className="neu-panel mt-12 p-5">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-glow)] text-[var(--accent-light)]">
            <LockKeyhole size={20} />
          </div>
          <h3 className="text-sm font-semibold">Privacy first</h3>
          <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">
            Your documents are stored privately with server-side encryption
            and authenticated access.
          </p>
        </div>

        <div className="mt-auto pt-8">
          <div className="neu-inset flex items-center gap-3 rounded-2xl p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-glow)] text-sm font-bold text-[var(--accent-light)]">
              {user.full_name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.full_name}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {user.email}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-[var(--text-secondary)] transition hover:text-[var(--danger)]"
            >
              <LogOut size={18} />
            </button>
          </div>
          <p className="mt-5 text-center text-[10px] text-[var(--text-muted)]">
            EvidenceVault · Secure workspace
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/[0.025] bg-[var(--bg-primary)]/95 px-5 py-5 backdrop-blur-xl md:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="neu-button !p-2.5 md:hidden"
              onClick={() => setMobileMenu(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{activePage}</h2>
              <p className="mt-1 hidden text-xs text-[var(--text-muted)] sm:block">
                Your secure document workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/10 bg-emerald-500/[0.06] px-3 py-2 text-xs text-[var(--success)] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
              Secure session
            </div>
            <button
              className="neu-button relative !p-3"
              aria-label="Notifications"
              onClick={() => showNotice("success", "You're all caught up.")}
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] space-y-8 p-5 md:p-9">
          {activePage === "Dashboard" && (
            <>
              <section className="neu-panel relative overflow-hidden p-6 md:p-9">
                <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[var(--accent)] opacity-[0.09] blur-3xl" />
                <div className="relative flex flex-col justify-between gap-7 md:flex-row md:items-center">
                  <div className="max-w-2xl">
                    <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent-light)]">
                      <Cloud size={15} />
                      Your digital document vault
                    </div>
                    <h3 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                      Store securely.
                      <br />
                      <span className="text-[var(--accent-light)]">
                        Access confidently.
                      </span>
                    </h3>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--text-secondary)]">
                      One secure space for your important documents, powered
                      by private cloud storage and controlled access.
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="neu-button neu-button-primary"
                    >
                      {uploading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <UploadCloud size={18} />
                      )}
                      {uploading ? "Uploading..." : "Upload document"}
                    </button>
                    <button
                      onClick={() => setActivePage("My Documents")}
                      className="neu-button"
                    >
                      <Files size={18} />
                      View files
                    </button>
                  </div>
                </div>
              </section>

              <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total documents"
                  value={String(documents.length).padStart(2, "0")}
                  detail="Active documents"
                  icon={Files}
                  color="violet"
                />
                <MetricCard
                  label="Storage used"
                  value={formatBytes(totalStorage)}
                  detail="Across your documents"
                  icon={HardDrive}
                  color="blue"
                />
                <MetricCard
                  label="Encryption"
                  value="AES-256"
                  detail="S3 server-side encryption"
                  icon={LockKeyhole}
                  color="green"
                />
                <MetricCard
                  label="Account security"
                  value="Protected"
                  detail="Authenticated session"
                  icon={ShieldCheck}
                  color="green"
                />
              </section>

              <section className="grid gap-6 xl:grid-cols-3">
                <div className="neu-panel min-w-0 p-5 md:p-7 xl:col-span-2">
                  <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-lg font-semibold">Recent documents</h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Your latest securely stored files
                      </p>
                    </div>
                    <button
                      onClick={() => setActivePage("My Documents")}
                      className="text-left text-xs font-semibold text-[var(--accent-light)] hover:text-white"
                    >
                      View all documents →
                    </button>
                  </div>

                  <DocumentList
                    documents={documents.slice(0, 5)}
                    busyDocument={busyDocument}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                  />
                </div>

                <SecurityPanel
                  user={user}
                  documentCount={documents.length}
                  storage={formatBytes(totalStorage)}
                />
              </section>
            </>
          )}

          {activePage === "My Documents" && (
            <section className="neu-panel p-5 md:p-7">
              <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                <div>
                  <h3 className="text-xl font-semibold">My Documents</h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Manage your privately stored files.
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="neu-button neu-button-primary"
                >
                  {uploading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Plus size={18} />
                  )}
                  Add document
                </button>
              </div>

              <div
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!uploading) setIsDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!uploading) setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);

                  if (uploading) return;

                  const file = event.dataTransfer.files?.[0];
                  if (file) void handleUpload(file);
                }}
                className={`mb-7 rounded-2xl border-2 border-dashed p-7 text-center transition-all duration-200 ${
                  isDragging
                    ? "scale-[1.01] border-[var(--accent)] bg-[var(--accent-glow)]"
                    : "border-white/10 bg-[var(--bg-inset)] hover:border-[var(--accent)]/50"
                } ${uploading ? "cursor-not-allowed opacity-60" : ""}`}
                aria-label="Drag and drop a document to upload"
              >
                <div className="neu-panel mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
                  {uploading ? (
                    <Loader2
                      size={25}
                      className="animate-spin text-[var(--accent-light)]"
                    />
                  ) : (
                    <UploadCloud
                      size={25}
                      className="text-[var(--accent-light)]"
                    />
                  )}
                </div>
                <h4 className="font-semibold">
                  {uploading
                    ? "Uploading your document..."
                    : isDragging
                      ? "Drop your file here"
                      : "Drag and drop a document"}
                </h4>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  PDF, PNG, JPG, DOCX, XLSX and TXT · Maximum 10 MB
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="neu-button neu-button-primary mt-5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={17} />
                  Browse files
                </button>
              </div>

              <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_190px]">
                <div className="neu-inset flex min-w-0 items-center gap-3 rounded-xl px-4 py-1">
                  <Search size={18} className="shrink-0 text-[var(--text-muted)]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search your documents..."
                    className="w-full min-w-0 bg-transparent py-3 text-sm outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <span className="whitespace-nowrap text-xs text-[var(--text-muted)]">
                    {filteredDocuments.length} files
                  </span>
                </div>

                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="neu-input"
                  aria-label="Filter documents by type"
                >
                  <option value="all">All file types</option>
                  <option value="pdf">PDF files</option>
                  <option value="images">Images</option>
                  <option value="documents">Documents</option>
                  <option value="spreadsheets">Spreadsheets</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="neu-input"
                  aria-label="Sort documents"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                  <option value="largest">Largest first</option>
                </select>
              </div>

              <DocumentList
                documents={filteredDocuments}
                busyDocument={busyDocument}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            </section>
          )}

          {activePage === "Storage Analytics" && (
            <section className="space-y-6">
              <div className="neu-panel flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center md:p-8">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent-light)]">
                    <BarChart3 size={15} />
                    Storage insights
                  </div>
                  <h3 className="text-2xl font-bold">Your storage at a glance</h3>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Analytics calculated from your active documents.
                  </p>
                </div>
                <div className="neu-inset rounded-2xl px-5 py-4">
                  <p className="text-xs text-[var(--text-muted)]">Total storage used</p>
                  <p className="mt-1 text-2xl font-bold">{formatBytes(totalStorage)}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {documents.length} active {documents.length === 1 ? "document" : "documents"}
                  </p>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="neu-panel p-6 md:p-7">
                  <h4 className="text-lg font-semibold">Storage by file type</h4>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Share of total stored file size
                  </p>

                  <div className="mt-7 flex flex-col items-center gap-8 sm:flex-row">
                    <div
                      className="relative flex h-52 w-52 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: storageAnalytics.chartBackground,
                        boxShadow: "7px 7px 16px #181b24, -7px -7px 16px #282b38",
                      }}
                      role="img"
                      aria-label="Donut chart showing storage distribution by file type"
                    >
                      <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full"
                        style={{
                          background: "var(--bg-primary)",
                          boxShadow: "inset 5px 5px 10px #181b24, inset -5px -5px 10px #282b38",
                        }}>
                        <span className="text-xl font-bold">{formatBytes(totalStorage)}</span>
                        <span className="mt-1 text-[10px] text-[var(--text-muted)]">TOTAL USED</span>
                      </div>
                    </div>

                    <div className="w-full space-y-4">
                      {storageAnalytics.groups.map((group) => (
                        <div key={group.key} className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="truncate text-sm text-[var(--text-secondary)]">
                              {group.label}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatBytes(group.bytes)}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {group.count} {group.count === 1 ? "file" : "files"}
                              {totalStorage > 0
                                ? ` · ${((group.bytes / totalStorage) * 100).toFixed(1)}%`
                                : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="neu-panel p-6 md:p-7">
                  <h4 className="text-lg font-semibold">Document distribution</h4>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Number of active documents by category
                  </p>
                  <div className="mt-7 space-y-5">
                    {storageAnalytics.groups.map((group) => {
                      const percentage =
                        documents.length > 0
                          ? (group.count / documents.length) * 100
                          : 0;
                      return (
                        <div key={group.key}>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-sm text-[var(--text-secondary)]">{group.label}</span>
                            <span className="text-xs font-semibold">
                              {group.count} · {percentage.toFixed(0)}%
                            </span>
                          </div>
                          <div className="neu-inset h-3 overflow-hidden rounded-full p-[2px]">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: group.color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="neu-panel p-6 md:p-7">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold">Largest documents</h4>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Files using the most storage
                      </p>
                    </div>
                    <HardDrive className="text-[var(--accent-light)]" size={20} />
                  </div>
                  {storageAnalytics.largest.length === 0 ? (
                    <p className="neu-inset rounded-xl p-5 text-sm text-[var(--text-muted)]">
                      Upload documents to see storage rankings.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {storageAnalytics.largest.map((document, index) => (
                        <div key={document.id} className="neu-inset flex items-center gap-3 rounded-xl p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-glow)] text-xs font-bold text-[var(--accent-light)]">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{document.original_name}</p>
                            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                              {formatDate(document.created_at)}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold">
                            {formatBytes(Number(document.file_size_bytes))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="neu-panel p-6 md:p-7">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold">Recently uploaded</h4>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Your five latest documents
                      </p>
                    </div>
                    <Activity className="text-[var(--accent-light)]" size={20} />
                  </div>
                  {storageAnalytics.recent.length === 0 ? (
                    <p className="neu-inset rounded-xl p-5 text-sm text-[var(--text-muted)]">
                      No uploads yet. Your recent files will appear here.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {storageAnalytics.recent.map((document) => {
                        const Icon = getFileIcon(document.content_type);
                        return (
                          <div key={document.id} className="neu-inset flex items-center gap-3 rounded-xl p-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-glow)] text-[var(--accent-light)]">
                              <Icon size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{document.original_name}</p>
                              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                                {formatDate(document.created_at)}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                              {formatBytes(Number(document.file_size_bytes))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <p className="px-1 text-xs leading-5 text-[var(--text-muted)]">
                These figures are calculated from the active documents returned by your authenticated API.
                They represent stored file sizes, not your AWS account's total billed storage or a configured storage quota.
              </p>
            </section>
          )}

          {activePage === "Security Activity" && (
            <section className="neu-panel p-6 md:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="neu-inset flex h-12 w-12 items-center justify-center rounded-xl text-[var(--accent-light)]">
                  <Activity size={23} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Security Activity</h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Current account security information
                  </p>
                </div>
              </div>

              <div className="neu-inset rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-[var(--success)]" size={22} />
                  <div>
                    <p className="text-sm font-semibold">Authenticated session</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      You are signed in to your private workspace.
                    </p>
                  </div>
                </div>
                <div className="my-5 h-px bg-white/[0.05]" />
                <div className="flex items-center gap-3">
                  <LockKeyhole className="text-[var(--accent-light)]" size={22} />
                  <div>
                    <p className="text-sm font-semibold">S3 server-side encryption</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Uploaded objects are verified for AES256 encryption.
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-5 text-xs leading-6 text-[var(--text-muted)]">
                Detailed event history is not connected to the security_activities
                database table yet. This page currently displays verified
                account and storage security information, not a live audit log.
              </p>
            </section>
          )}

          {activePage === "Settings" && (
            <section className="neu-panel max-w-3xl p-6 md:p-8">
              <h3 className="text-xl font-semibold">Account Settings</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Your EvidenceVault account information.
              </p>

              <div className="neu-inset mt-7 space-y-5 rounded-2xl p-5">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Full name</p>
                  <p className="mt-2 text-sm font-medium">{user.full_name}</p>
                </div>
                <div className="h-px bg-white/[0.05]" />
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Email address</p>
                  <p className="mt-2 text-sm font-medium">{user.email}</p>
                </div>
                <div className="h-px bg-white/[0.05]" />
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Account role</p>
                  <p className="mt-2 text-sm font-medium">{user.role || "user"}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="neu-button mt-6 text-[var(--danger)]"
              >
                <LogOut size={17} />
                Sign out
              </button>
            </section>
          )}

          <footer className="border-t border-white/[0.04] py-5 text-center text-xs text-[var(--text-muted)]">
            EvidenceVault · Secure cloud document management
          </footer>
        </div>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUpload(file);
        }}
      />

      {notice && <NoticeToast notice={notice} />}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Files;
  color: "violet" | "blue" | "green";
}) {
  const iconColors = {
    violet: "text-[var(--accent-light)]",
    blue: "text-sky-300",
    green: "text-[var(--success)]",
  };

  return (
    <div className="neu-panel p-5 transition-transform duration-200 hover:-translate-y-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
        <div className="neu-inset flex h-10 w-10 items-center justify-center rounded-xl">
          <Icon size={19} className={iconColors[color]} />
        </div>
      </div>
      <p className="mt-6 truncate text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}

function DocumentList({
  documents,
  busyDocument,
  onDownload,
  onDelete,
}: {
  documents: DocumentRecord[];
  busyDocument: string | null;
  onDownload: (document: DocumentRecord) => void;
  onDelete: (document: DocumentRecord) => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="neu-inset flex flex-col items-center justify-center rounded-2xl px-5 py-14 text-center">
        <div className="neu-panel mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
          <Files size={26} className="text-[var(--accent-light)]" />
        </div>
        <p className="font-semibold">No documents found</p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Upload a document to see it in your secure library.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((document) => {
        const Icon = getFileIcon(document.content_type);
        const busy = busyDocument === document.id;

        return (
          <div
            key={document.id}
            className="neu-raised-small flex flex-col gap-4 rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 sm:flex-row sm:items-center"
          >
            <div className="neu-inset flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--accent-light)]">
              <Icon size={22} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {document.original_name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                <span>{formatBytes(Number(document.file_size_bytes))}</span>
                <span>·</span>
                <span>{formatDate(document.created_at)}</span>
                <span>·</span>
                <span className="text-[var(--success)]">Secure</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => onDownload(document)}
                disabled={busy}
                title="Download document"
                className="neu-button !rounded-xl !p-3 text-[var(--accent-light)] disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Download size={17} />
                )}
              </button>
              <button
                onClick={() => onDelete(document)}
                disabled={busy}
                title="Delete document"
                className="neu-button !rounded-xl !p-3 text-[var(--danger)] disabled:opacity-50"
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SecurityPanel({
  user,
  documentCount,
  storage,
}: {
  user: User;
  documentCount: number;
  storage: string;
}) {
  return (
    <div className="neu-panel p-5 md:p-6">
      <div className="flex items-center gap-3">
        <div className="neu-inset flex h-11 w-11 items-center justify-center rounded-xl text-[var(--success)]">
          <ShieldCheck size={23} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Security overview</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Account status</p>
        </div>
      </div>

      <div className="neu-inset mt-6 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">Session</span>
          <span className="flex items-center gap-2 text-xs text-[var(--success)]">
            <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
            Active
          </span>
        </div>
        <div className="my-4 h-px bg-white/[0.05]" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">Encryption</span>
          <span className="text-xs font-semibold text-[var(--success)]">AES-256</span>
        </div>
      </div>

      <h4 className="mb-4 mt-7 text-sm font-semibold">Workspace summary</h4>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--text-secondary)]">Account</span>
          <span className="max-w-[150px] truncate text-xs">{user.email}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">Documents</span>
          <span className="text-xs font-semibold">{documentCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">Storage used</span>
          <span className="text-xs font-semibold">{storage}</span>
        </div>
      </div>

      <div className="neu-inset mt-7 rounded-xl p-4">
        <div className="flex items-center gap-2 text-[var(--accent-light)]">
          <LockKeyhole size={17} />
          <span className="text-xs font-semibold">Private by design</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
          Your documents are accessed through authenticated, temporary
          download links.
        </p>
      </div>
    </div>
  );
}

function NoticeToast({ notice }: { notice: Notice }) {
  const success = notice.type === "success";

  return (
    <div
      role="status"
      className="neu-panel fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-40px)] items-center gap-3 p-4 shadow-2xl"
    >
      {success ? (
        <CheckCircle2 size={20} className="shrink-0 text-[var(--success)]" />
      ) : (
        <AlertCircle size={20} className="shrink-0 text-[var(--danger)]" />
      )}
      <p className="text-sm">{notice.message}</p>
    </div>
  );
}
