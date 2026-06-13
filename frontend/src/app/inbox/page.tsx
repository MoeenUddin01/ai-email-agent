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

      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        try { setEmails(JSON.parse(cached)); } catch {}
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

    try {
      const gisCodeClient = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify",
        callback: async (response: any) => {
          if (response.code) {
            const resp = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/gmail/exchange`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
          showToast(`Fetched ${data.emails.length} emails from Gmail`);
        } else {
          showToast("Inbox synced — no new emails", "success");
        }
      } else if (data.status === "gmail_not_connected") {
        showToast('Please click "Connect Gmail" first to authorize Gmail access', "error");
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

  const avatarColors = ["#FF6803", "#AE3A02", "#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2"];
  const avatarColor = (sender: string | null | undefined) => {
    if (!sender) return avatarColors[0];
    return avatarColors[sender.charCodeAt(0) % avatarColors.length];
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <div className="animate-spin-slow" style={{ width: 22, height: 22, border: "2px solid #E0E0E0", borderTopColor: "var(--orange)", borderRadius: "50%" }} />
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.type === "error" ? "#FEF2F2" : "#F0FDF4",
          borderColor: toast.type === "error" ? "#FECACA" : "#BBF7D0",
        }}>
          <span style={{ color: toast.type === "error" ? "#DC2626" : "#16A34A", fontSize: 13, fontWeight: 500 }}>
            {toast.type === "error" ? "!" : "✓"} {toast.msg}
          </span>
        </div>
      )}

      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoSmall}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" /><path d="M14 22H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10" /><path d="M18 14v8" /><path d="M22 18h-8" />
            </svg>
          </div>
          <span style={styles.appName}>AI Email Agent</span>
        </div>

        <div style={styles.headerCenter}>
          {gmailStatus.connected ? (
            <div style={styles.connectedPill}>
              <span style={styles.greenDot} />
              <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 500 }}>
                {gmailStatus.email ? gmailStatus.email : "Gmail connected"}
              </span>
            </div>
          ) : (
            <button id="connect-gmail-header" onClick={connectGmail} style={styles.connectBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Connect Gmail
            </button>
          )}
        </div>

        <div style={styles.headerRight}>
          <button id="sync-btn" onClick={syncEmails} disabled={syncing} style={styles.iconBtn} title="Sync emails">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={syncing ? "animate-spin-slow" : ""}>
              <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <div style={styles.avatarWrap} title={userEmail}>
            {userAvatar ? <img src={userAvatar} alt="" style={styles.avatarImg} />
            : <div style={styles.avatarFallback}>{userEmail[0]?.toUpperCase()}</div>}
          </div>

          <button id="logout-btn" onClick={handleLogout} style={styles.iconBtn} title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <div style={styles.body}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarTop}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#999" }}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <span style={styles.sidebarTitle}>Inbox</span>
            </div>
            <span style={styles.emailCount}>{emails.length}</span>
          </div>

          <div style={styles.emailList}>
            {emails.length === 0 ? (
              <div style={styles.emptyState}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D0D0D0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <p style={styles.emptyTitle}>No emails yet</p>
                <p style={styles.emptyDesc}>Connect Gmail and sync to load your inbox</p>
                {!gmailStatus.connected && (
                  <button id="connect-gmail-empty" onClick={connectGmail} style={styles.emptyConnectBtn}>
                    Connect Gmail
                  </button>
                )}
                <button id="sync-empty-btn" onClick={syncEmails} disabled={syncing} style={{
                  ...styles.primaryBtn, opacity: syncing ? 0.6 : 1, cursor: syncing ? "not-allowed" : "pointer",
                }}>
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
                    ...styles.emailItem,
                    background: selectedEmail?.id === email.id ? "#FFF8F4" : "transparent",
                    borderLeft: selectedEmail?.id === email.id ? "3px solid var(--orange)" : "3px solid transparent",
                  }}
                >
                  <div style={{ ...styles.emailAvatar, background: avatarColor(email.sender) }}>
                    {senderInitial(email.sender)}
                  </div>
                  <div style={styles.emailMeta}>
                    <div style={styles.emailTopRow}>
                      <span style={styles.emailSender}>{senderName(email.sender)}</span>
                      <span style={styles.emailTime}>{formatDate(email.received_at)}</span>
                    </div>
                    <p style={{ ...styles.emailSubject, color: email.status === "unread" ? "var(--dark)" : "#666" }}>
                      {email.subject || "(no subject)"}
                    </p>
                    <p style={styles.emailSnippet}>{email.body_text?.slice(0, 65)}</p>
                  </div>
                  {email.status === "unread" && <div style={styles.unreadDot} />}
                </div>
              ))
            )}
          </div>
        </aside>

        <main style={styles.detail}>
          {selectedEmail ? (
            <div className="animate-fade-in" style={styles.detailInner}>
              <div style={styles.detailHeader}>
                <div style={styles.detailMeta}>
                  <div style={{ ...styles.senderAvatar, background: avatarColor(selectedEmail.sender) }}>
                    {senderInitial(selectedEmail.sender)}
                  </div>
                  <div>
                    <p style={styles.detailSender}>{senderName(selectedEmail.sender)}</p>
                    <p style={styles.detailEmail}>{selectedEmail.sender}</p>
                  </div>
                  <span style={styles.detailDate}>{formatDate(selectedEmail.received_at, true)}</span>
                </div>
                <h2 style={styles.detailSubject}>{selectedEmail.subject || "(no subject)"}</h2>
              </div>

              <div style={styles.detailBody}>
                <pre style={styles.emailBody}>{selectedEmail.body_text || "(empty)"}</pre>
              </div>

              <div style={styles.detailActions}>
                <button
                  id={`reply-btn-${selectedEmail.id}`}
                  onClick={() => {
                    sessionStorage.setItem("ai_agent_email_data", JSON.stringify(selectedEmail));
                    router.push(`/reply?id=${selectedEmail.gmail_id || selectedEmail.id}`);
                  }}
                  style={styles.orangeBtn}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 12 5-5v3h7a4 4 0 0 1 4 4v3" /><path d="m3 12 5 5" />
                  </svg>
                  Generate AI Reply
                </button>
                <div style={{
                  ...styles.statusBadge,
                  ...(selectedEmail.status === "replied" || selectedEmail.status === "answered" ? styles.badgeReplied : styles.badgeUnread),
                }}>
                  {selectedEmail.status === "replied" || selectedEmail.status === "answered" ? "Replied" : "Unread"}
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.noSelection}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D0D0D0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <p style={styles.noSelTitle}>Select an email</p>
              <p style={styles.noSelDesc}>Click any email on the left to read and reply</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", height: "100vh", background: "#FAFAF8", color: "var(--dark)", fontFamily: "Inter, sans-serif", overflow: "hidden" },
  center: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#FAFAF8" },
  toast: { position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: 999, border: "1px solid", zIndex: 9999, fontSize: 13, fontFamily: "Inter, sans-serif", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" },

  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56, background: "white", borderBottom: "1px solid var(--border)", flexShrink: 0, gap: 12 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10, minWidth: 160 },
  headerCenter: { display: "flex", alignItems: "center", justifyContent: "center", flex: 1 },
  headerRight: { display: "flex", alignItems: "center", gap: 6, minWidth: 160, justifyContent: "flex-end" },
  logoSmall: { width: 28, height: 28, borderRadius: 8, background: "var(--orange)", display: "flex", alignItems: "center", justifyContent: "center" },
  appName: { fontSize: 14, fontWeight: 700, color: "var(--dark)" },
  connectedPill: { display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 999 },
  greenDot: { width: 6, height: 6, background: "#22C55E", borderRadius: "50%", flexShrink: 0 },
  connectBtn: { display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", background: "var(--orange)", border: "none", borderRadius: 999, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(255,104,3,0.25)" },
  iconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "#666", cursor: "pointer", transition: "all 0.15s" },
  avatarWrap: { width: 30, height: 30, borderRadius: "50%", overflow: "hidden", border: "2px solid var(--border)", flexShrink: 0 },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  avatarFallback: { width: "100%", height: "100%", background: "var(--orange)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "white" },

  body: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: { width: 340, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", background: "white" },
  sidebarTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" },
  sidebarTitle: { fontSize: 12, fontWeight: 600, color: "#999", letterSpacing: "0.5px", textTransform: "uppercase" },
  emailCount: { fontSize: 11, padding: "2px 8px", background: "#FFF0E8", color: "var(--orange)", borderRadius: 999, fontWeight: 600 },
  emailList: { flex: 1, overflowY: "auto" },

  emailItem: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid #F0F0EE", transition: "background 0.1s", position: "relative" },
  emailAvatar: { width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white", flexShrink: 0, marginTop: 2 },
  emailMeta: { flex: 1, minWidth: 0 },
  emailTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  emailSender: { fontSize: 13, fontWeight: 600, color: "var(--dark)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  emailTime: { fontSize: 11, color: "#999", flexShrink: 0 },
  emailSubject: { margin: "3px 0 0", fontSize: 12, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 },
  emailSnippet: { margin: "2px 0 0", fontSize: 11, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  unreadDot: { width: 6, height: 6, background: "var(--orange)", borderRadius: "50%", flexShrink: 0, marginTop: 8 },

  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 20px", gap: 12 },
  emptyTitle: { margin: 0, fontSize: 14, fontWeight: 600, color: "#999" },
  emptyDesc: { margin: 0, fontSize: 12, color: "#BFBFBF", textAlign: "center", lineHeight: 1.5 },
  emptyConnectBtn: { padding: "8px 20px", background: "var(--orange)", border: "none", borderRadius: 999, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 4, boxShadow: "0 2px 8px rgba(255,104,3,0.25)" },
  primaryBtn: { padding: "8px 20px", background: "var(--orange)", border: "none", borderRadius: 999, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(255,104,3,0.25)" },

  detail: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", background: "white" },
  detailInner: { padding: "28px 36px", maxWidth: 760, width: "100%", margin: "0 auto" },
  detailHeader: { borderBottom: "1px solid var(--border)", paddingBottom: 20, marginBottom: 20 },
  detailSubject: { margin: "16px 0 0", fontSize: 22, fontWeight: 700, color: "var(--dark)", lineHeight: 1.3 },
  detailMeta: { display: "flex", alignItems: "center", gap: 12 },
  senderAvatar: { width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "white", flexShrink: 0 },
  detailSender: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dark)" },
  detailEmail: { margin: "2px 0 0", fontSize: 12, color: "#999" },
  detailDate: { marginLeft: "auto", fontSize: 12, color: "#BFBFBF", whiteSpace: "nowrap" },
  detailBody: { background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 },
  emailBody: { margin: 0, fontSize: 14, color: "#444", lineHeight: 1.7, fontFamily: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  detailActions: { display: "flex", alignItems: "center", gap: 12 },
  orangeBtn: { display: "flex", alignItems: "center", gap: 8, background: "var(--orange)", color: "white", border: "none", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(255,104,3,0.3)" },
  statusBadge: { padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500 },
  badgeUnread: { background: "#FFF0E8", color: "var(--orange)" },
  badgeReplied: { background: "#F0FDF4", color: "#16A34A" },

  noSelection: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
  noSelTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: "#999" },
  noSelDesc: { margin: 0, fontSize: 13, color: "#BFBFBF" },
};
