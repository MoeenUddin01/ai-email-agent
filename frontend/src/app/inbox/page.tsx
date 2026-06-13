"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";

interface Email {
  id: string;
  gmail_id?: string;
  sender?: string | null;
  subject?: string | null;
  body_text?: string | null;
  received_at?: string | null;
  status?: string | null;
}

interface GmailStatus {
  connected: boolean;
  email?: string;
}

const STORAGE_KEY = "ai_agent_emails";

export default function Inbox() {
  const router = useRouter();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus>({ connected: false });
  const [userEmail, setUserEmail] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const checkGmailStatus = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/health/gmail-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGmailStatus({ connected: data.connected, email: data.gmail_email });
      }
    } catch {
      // health endpoint may not exist — check credentials table indirectly via sync
      setGmailStatus({ connected: false });
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const g = p.get('gmail');
      const m = p.get('msg');
      if (g === 'connected') showToast('Gmail connected!', 'success');
      else if (g === 'error') showToast(m ? `Gmail error: ${m}` : 'Gmail connection failed', 'error');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/"); return; }

      setUserEmail(session.user.email ?? "");
      setUserAvatar(session.user.user_metadata?.avatar_url ?? "");

      // Restore cached emails instantly — no re-fetch needed on navigation back
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        try { setEmails(JSON.parse(cached)); } catch { /* ignore */ }
      }

      await checkGmailStatus(session.access_token);
      setLoading(false);
    };
    init();
  }, [router, checkGmailStatus]);

  const connectGmail = async () => {
    const token = await getToken();
    if (!token) {
      showToast("Session expired — please sign out and sign in again", "error");
      return;
    }

    // Fetch Gmail client ID from the backend (single source of truth)
    let clientId: string;
    try {
      const ciRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/gmail/client-id`);
      const ciData = await ciRes.json();
      clientId = ciData.client_id;
      if (!clientId) throw new Error("No client_id in response");
    } catch (e) {
      showToast(`Failed to get Gmail config: ${(e as Error).message}`, "error");
      return;
    }

    // Use Google Identity Services (GIS) popup-based OAuth.
    // Google returns the auth code directly to this JavaScript callback — no redirect needed.
    try {
      const gisCodeClient = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify",
        callback: async (response: any) => {
          if (response.code) {
            const resp = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/gmail/exchange`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ code: response.code }),
            });
            if (resp.ok) {
              setGmailStatus({ connected: true });
              showToast("Gmail connected!", "success");
              if (window.location.search.includes("gmail=")) {
                window.history.replaceState({}, "", "/inbox");
              }
            } else {
              const errText = await resp.text();
              showToast(`Gmail connect failed: ${errText.slice(0, 80)}`, "error");
            }
          } else if (response.error) {
            showToast(`Authorization cancelled or failed: ${response.error}`, "error");
          }
        },
        error_callback: (error: any) => {
          showToast(`Google auth error: ${error?.message || error?.type || "unknown"}`, "error");
        },
      });
      gisCodeClient.requestCode();
    } catch (e) {
      showToast(`Failed to start Gmail auth: ${(e as Error).message}`, "error");
    }
  };

  const syncEmails = async () => {
    const token = await getToken();
    if (!token) {
      showToast("Session expired — please sign out and sign in again", "error");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/emails/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        if (data.emails?.length > 0) {
          setEmails(data.emails);
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.emails));
          setGmailStatus((prev) => ({ ...prev, connected: true }));
          showToast(`✓ Fetched ${data.emails.length} emails from Gmail`);
        } else {
          showToast("✓ Inbox synced — no new emails", "success");
        }
      } else if (data.status === "gmail_not_connected") {
        showToast("Please click \"Connect Gmail\" first to authorize Gmail access", "error");
      } else {
        showToast(data.detail || "Sync failed", "error");
        setSyncing(false);
        return;
      }
    } catch {
      showToast("Sync failed — check connection", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem(STORAGE_KEY);
    await supabase.auth.signOut();
    router.push("/");
  };

  const formatDate = (iso: string | null | undefined, full = false) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    if (full) return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const senderName = (sender: string | null | undefined) => {
    if (!sender) return "Unknown";
    const match = sender.match(/^([^<]+)</);
    return match ? match[1].trim() : sender.split("@")[0];
  };

  const senderInitial = (sender: string | null | undefined) => senderName(sender)[0]?.toUpperCase() ?? "?";

  const avatarColor = (sender: string | null | undefined) => {
    if (!sender) return "#4f7ef8";
    const colors = ["#4f7ef8", "#7c5af8", "#f85a8a", "#f8a24f", "#22c55e", "#06b6d4"];
    const i = sender.charCodeAt(0) % colors.length;
    return colors[i];
  };

  if (loading) {
    return (
      <div style={S.fullCenter}>
        <div style={S.spinner} />
      </div>
    );
  }

  return (
    <div style={S.root}>
      {/* Toast */}
      {toast && (
        <div style={{ ...S.toast, background: toast.type === "error" ? "#2d1a1a" : "#0f2a1a", borderColor: toast.type === "error" ? "#7f1d1d" : "#14532d" }}>
          <span style={{ color: toast.type === "error" ? "#fca5a5" : "#86efac", fontSize: "13px" }}>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logoMark}>⚡</div>
          <div>
            <span style={S.appName}>AI Email Agent</span>
          </div>
        </div>

        {/* Gmail connection pill */}
        <div style={S.headerCenter}>
          {gmailStatus.connected ? (
            <div style={S.connectedPill}>
              <span style={S.greenDot} />
              <span style={{ fontSize: "12px", color: "#86efac" }}>
                {gmailStatus.email ? gmailStatus.email : "Gmail connected"}
              </span>
            </div>
          ) : (
            <button id="connect-gmail-header" onClick={connectGmail} style={S.connectBtn}>
              <GmailIcon /> Connect Gmail
            </button>
          )}
        </div>

        <div style={S.headerRight}>
          <button id="sync-btn" onClick={syncEmails} disabled={syncing} style={S.iconBtn} title="Sync emails">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={syncing ? { animation: "spin 1s linear infinite" } : {}}>
              <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <div style={S.avatarWrap} title={userEmail}>
            {userAvatar ? (
              <img src={userAvatar} alt="avatar" style={S.avatarImg} />
            ) : (
              <div style={S.avatarFallback}>{userEmail[0]?.toUpperCase()}</div>
            )}
          </div>

          <button id="logout-btn" onClick={handleLogout} style={S.iconBtn} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={S.body}>
        {/* Sidebar */}
        <aside style={S.sidebar}>
          <div style={S.sidebarTop}>
            <span style={S.sidebarTitle}>Inbox</span>
            <span style={S.emailCount}>{emails.length}</span>
          </div>

          <div style={S.emailList}>
            {emails.length === 0 ? (
              <div style={S.emptyState}>
                <div style={S.emptyIcon}>📭</div>
                <p style={S.emptyTitle}>No emails yet</p>
                <p style={S.emptyDesc}>Connect Gmail and sync to load your inbox</p>
                {!gmailStatus.connected && (
                  <button id="connect-gmail-empty" onClick={connectGmail} style={S.emptyConnectBtn}>
                    <GmailIcon /> Connect Gmail
                  </button>
                )}
                <button id="sync-empty-btn" onClick={syncEmails} disabled={syncing} style={{ ...S.emptySyncBtn, opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? "Syncing…" : "Sync Emails"}
                </button>
              </div>
            ) : (
              emails.map((email) => (
                <div
                  id={`email-item-${email.id}`}
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  style={{
                    ...S.emailItem,
                    background: selectedEmail?.id === email.id ? "#1a2035" : "transparent",
                    borderLeft: selectedEmail?.id === email.id ? "3px solid #4f7ef8" : "3px solid transparent",
                  }}
                >
                  <div style={{ ...S.emailAvatar, background: avatarColor(email.sender) }}>
                    {senderInitial(email.sender)}
                  </div>
                  <div style={S.emailMeta}>
                    <div style={S.emailTopRow}>
                      <span style={S.emailSender}>{senderName(email.sender)}</span>
                      <span style={S.emailTime}>{formatDate(email.received_at)}</span>
                    </div>
                    <p style={S.emailSubject}>{email.subject || "(no subject)"}</p>
                    <p style={S.emailSnippet}>{email.body_text?.slice(0, 60)}…</p>
                  </div>
                  {email.status === "unread" && <div style={S.unreadDot} />}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Detail pane */}
        <main style={S.detail}>
          {selectedEmail ? (
            <div style={S.detailInner} className="animate-fade-in">
              <div style={S.detailHeader}>
                <h2 style={S.detailSubject}>{selectedEmail.subject || "(no subject)"}</h2>
                <div style={S.detailMeta}>
                  <div style={{ ...S.senderAvatar, background: avatarColor(selectedEmail.sender) }}>
                    {senderInitial(selectedEmail.sender)}
                  </div>
                  <div>
                    <p style={S.detailSender}>{senderName(selectedEmail.sender)}</p>
                    <p style={S.detailEmail}>{selectedEmail.sender}</p>
                  </div>
                  <span style={S.detailDate}>
                    {formatDate(selectedEmail.received_at, true)}
                  </span>
                </div>
              </div>

              <div style={S.detailBody}>
                <pre style={S.emailBody}>{selectedEmail.body_text || "(empty)"}</pre>
              </div>

              <div style={S.detailActions}>
                <button
                  id={`reply-btn-${selectedEmail.id}`}
                  onClick={() => {
                    sessionStorage.setItem("ai_agent_email_data", JSON.stringify(selectedEmail));
                    router.push(`/reply?id=${selectedEmail.gmail_id || selectedEmail.id}`);
                  }}
                  style={S.replyBtn}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#5d8aff")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#4f7ef8")}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 12 5-5v3h7a4 4 0 0 1 4 4v3" /><path d="m3 12 5 5" />
                  </svg>
                  Generate AI Reply
                </button>
                <div style={{ ...S.statusBadge, ...(selectedEmail.status === "replied" ? S.badgeReplied : S.badgeUnread) }}>
                  {selectedEmail.status}
                </div>
              </div>
            </div>
          ) : (
            <div style={S.noSelection}>
              <div style={S.noSelectionIcon}>💬</div>
              <p style={S.noSelectionTitle}>Select an email</p>
              <p style={S.noSelectionDesc}>Click any email on the left to read and reply</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function GmailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", height: "100vh", background: "#0d0f14", color: "#e8eaf0", fontFamily: "Inter, sans-serif", overflow: "hidden" },
  fullCenter: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d0f14" },
  spinner: { width: "28px", height: "28px", border: "2px solid #232840", borderTopColor: "#4f7ef8", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  toast: { position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: "8px", border: "1px solid", zIndex: 9999, fontSize: "13px", fontFamily: "Inter, sans-serif", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" },

  // Header
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: "56px", background: "#12151c", borderBottom: "1px solid #232840", flexShrink: 0, gap: "12px" },
  headerLeft: { display: "flex", alignItems: "center", gap: "10px", minWidth: "160px" },
  headerCenter: { display: "flex", alignItems: "center", justifyContent: "center", flex: 1 },
  headerRight: { display: "flex", alignItems: "center", gap: "8px", minWidth: "160px", justifyContent: "flex-end" },
  logoMark: { width: "32px", height: "32px", background: "rgba(79,126,248,0.15)", border: "1px solid rgba(79,126,248,0.3)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" },
  appName: { fontSize: "15px", fontWeight: 600, color: "#e8eaf0" },
  connectedPill: { display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "99px" },
  greenDot: { width: "6px", height: "6px", background: "#22c55e", borderRadius: "50%", boxShadow: "0 0 4px #22c55e", flexShrink: 0 },
  connectBtn: { display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "rgba(79,126,248,0.12)", border: "1px solid rgba(79,126,248,0.3)", borderRadius: "8px", color: "#7aa4ff", fontSize: "12px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  iconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", background: "transparent", border: "1px solid #232840", borderRadius: "8px", color: "#8b91a8", cursor: "pointer", transition: "all 0.15s" },
  avatarWrap: { width: "32px", height: "32px", borderRadius: "50%", overflow: "hidden", border: "2px solid #232840", flexShrink: 0 },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  avatarFallback: { width: "100%", height: "100%", background: "#4f7ef8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "#fff" },

  // Body
  body: { display: "flex", flex: 1, overflow: "hidden" },

  // Sidebar
  sidebar: { width: "320px", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #232840", background: "#0f1118" },
  sidebarTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #232840" },
  sidebarTitle: { fontSize: "13px", fontWeight: 600, color: "#8b91a8", letterSpacing: "0.5px", textTransform: "uppercase" },
  emailCount: { fontSize: "11px", padding: "2px 7px", background: "rgba(79,126,248,0.15)", color: "#7aa4ff", borderRadius: "99px", fontWeight: 600 },
  emailList: { flex: 1, overflowY: "auto" as const },

  emailItem: { display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #1a1f2e", transition: "background 0.15s", position: "relative" as const },
  emailAvatar: { width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: "2px" },
  emailMeta: { flex: 1, minWidth: 0 },
  emailTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  emailSender: { fontSize: "13px", fontWeight: 600, color: "#d0d4e4", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  emailTime: { fontSize: "11px", color: "#555d78", flexShrink: 0 },
  emailSubject: { margin: "2px 0 0", fontSize: "12px", color: "#8b91a8", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  emailSnippet: { margin: "2px 0 0", fontSize: "11px", color: "#555d78", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  unreadDot: { width: "7px", height: "7px", background: "#4f7ef8", borderRadius: "50%", flexShrink: 0, marginTop: "6px", boxShadow: "0 0 6px #4f7ef8" },

  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px", gap: "10px" },
  emptyIcon: { fontSize: "40px" },
  emptyTitle: { margin: 0, fontSize: "14px", fontWeight: 600, color: "#8b91a8" },
  emptyDesc: { margin: 0, fontSize: "12px", color: "#555d78", textAlign: "center" as const },
  emptyConnectBtn: { display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "rgba(79,126,248,0.12)", border: "1px solid rgba(79,126,248,0.3)", borderRadius: "8px", color: "#7aa4ff", fontSize: "12px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginTop: "8px" },
  emptySyncBtn: { display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#4f7ef8", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },

  // Detail
  detail: { flex: 1, overflowY: "auto" as const, display: "flex", flexDirection: "column" },
  detailInner: { padding: "28px 36px", maxWidth: "760px", width: "100%" },
  detailHeader: { borderBottom: "1px solid #232840", paddingBottom: "20px", marginBottom: "20px" },
  detailSubject: { margin: "0 0 16px", fontSize: "22px", fontWeight: 700, color: "#e8eaf0", lineHeight: 1.3 },
  detailMeta: { display: "flex", alignItems: "center", gap: "12px" },
  senderAvatar: { width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: 700, color: "#fff", flexShrink: 0 },
  detailSender: { margin: 0, fontSize: "14px", fontWeight: 600, color: "#d0d4e4" },
  detailEmail: { margin: "2px 0 0", fontSize: "12px", color: "#555d78" },
  detailDate: { marginLeft: "auto", fontSize: "12px", color: "#555d78", whiteSpace: "nowrap" as const },
  detailBody: { background: "#181c26", border: "1px solid #232840", borderRadius: "10px", padding: "20px 24px", marginBottom: "24px" },
  emailBody: { margin: 0, fontSize: "14px", color: "#c0c4d8", lineHeight: 1.7, fontFamily: "inherit", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  detailActions: { display: "flex", alignItems: "center", gap: "12px" },
  replyBtn: { display: "flex", alignItems: "center", gap: "8px", background: "#4f7ef8", color: "#fff", border: "none", borderRadius: "10px", padding: "10px 20px", fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "background 0.2s", fontFamily: "inherit" },
  statusBadge: { padding: "4px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 500 },
  badgeUnread: { background: "rgba(79,126,248,0.15)", color: "#7aa4ff" },
  badgeReplied: { background: "rgba(34,197,94,0.12)", color: "#4ade80" },

  noSelection: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px" },
  noSelectionIcon: { fontSize: "48px" },
  noSelectionTitle: { margin: 0, fontSize: "16px", fontWeight: 600, color: "#8b91a8" },
  noSelectionDesc: { margin: 0, fontSize: "13px", color: "#555d78" },
};
