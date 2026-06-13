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

  const avatarColor = (sender: string | null | undefined) => {
    if (!sender) return "#4f7ef8";
    const colors = ["#4f7ef8", "#7c5af8", "#f85a8a", "#f8a24f", "#22c55e", "#06b6d4", "#f472b6", "#a78bfa"];
    const i = sender.charCodeAt(0) % colors.length;
    return colors[i];
  };

  if (loading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
      </div>
    );
  }

  return (
    <div style={s.root}>
      {toast && (
        <div style={{
          ...s.toast,
          background: toast.type === "error" ? "#2d1a1a" : "rgba(34,197,94,0.1)",
          borderColor: toast.type === "error" ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.2)",
        }}>
          <span style={{ color: toast.type === "error" ? "#fca5a5" : "#86efac", fontSize: "13px", fontWeight: 500 }}>
            {toast.type === "error" ? "!" : "✓"} {toast.msg}
          </span>
        </div>
      )}

      <header style={s.header}>
        <div style={s.headerLeft}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={s.logoSmall}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#4f7ef8" }}>
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><path d="M14 22H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10" /><path d="M18 14v8" /><path d="M22 18h-8" />
              </svg>
            </div>
            <span style={s.appName}>AI Email Agent</span>
          </div>
        </div>

        <div style={s.headerCenter}>
          {gmailStatus.connected ? (
            <div style={s.connectedPill}>
              <span style={s.greenDot} />
              <span style={{ fontSize: "12px", color: "#86efac", fontWeight: 500 }}>
                {gmailStatus.email ? gmailStatus.email : "Gmail connected"}
              </span>
            </div>
          ) : (
            <button id="connect-gmail-header" onClick={connectGmail} style={s.connectBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Connect Gmail
            </button>
          )}
        </div>

        <div style={s.headerRight}>
          <button id="sync-btn" onClick={syncEmails} disabled={syncing} style={s.iconBtn} title="Sync emails">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={syncing ? "animate-spin-slow" : ""}>
              <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <div style={s.avatarWrap} title={userEmail}>
            {userAvatar ? (
              <img src={userAvatar} alt="" style={s.avatarImg} />
            ) : (
              <div style={s.avatarFallback}>{userEmail[0]?.toUpperCase()}</div>
            )}
          </div>

          <button id="logout-btn" onClick={handleLogout} style={s.iconBtn} title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <div style={s.body}>
        <aside style={s.sidebar}>
          <div style={s.sidebarTop}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8b91a8" }}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <span style={s.sidebarTitle}>Inbox</span>
            </div>
            <span style={s.emailCount}>{emails.length}</span>
          </div>

          <div style={s.emailList}>
            {emails.length === 0 ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2d3347" }}>
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <p style={s.emptyTitle}>No emails yet</p>
                <p style={s.emptyDesc}>Connect Gmail and sync to load your inbox</p>
                {!gmailStatus.connected && (
                  <button id="connect-gmail-empty" onClick={connectGmail} style={s.emptyConnectBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    Connect Gmail
                  </button>
                )}
                <button id="sync-empty-btn" onClick={syncEmails} disabled={syncing} style={{
                  ...s.emptySyncBtn,
                  opacity: syncing ? 0.6 : 1,
                  cursor: syncing ? "not-allowed" : "pointer",
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
                    ...s.emailItem,
                    background: selectedEmail?.id === email.id ? s.emailItemActive.background : "transparent",
                    borderLeft: selectedEmail?.id === email.id ? "3px solid #4f7ef8" : "3px solid transparent",
                  }}
                >
                  <div style={{ ...s.emailAvatar, background: avatarColor(email.sender) }}>
                    {senderInitial(email.sender)}
                  </div>
                  <div style={s.emailMeta}>
                    <div style={s.emailTopRow}>
                      <span style={s.emailSender}>{senderName(email.sender)}</span>
                      <span style={s.emailTime}>{formatDate(email.received_at)}</span>
                    </div>
                    <p style={{ ...s.emailSubject, color: email.status === "unread" ? "#e8eaf0" : s.emailSubject.color }}>
                      {email.subject || "(no subject)"}
                    </p>
                    <p style={s.emailSnippet}>{email.body_text?.slice(0, 65)}</p>
                  </div>
                  {email.status === "unread" && <div style={s.unreadDot} />}
                </div>
              ))
            )}
          </div>
        </aside>

        <main style={s.detail}>
          {selectedEmail ? (
            <div style={s.detailInner} className="animate-fade-in">
              <div style={s.detailHeader}>
                <div style={s.detailMeta}>
                  <div style={{ ...s.senderAvatar, background: avatarColor(selectedEmail.sender) }}>
                    {senderInitial(selectedEmail.sender)}
                  </div>
                  <div>
                    <p style={s.detailSender}>{senderName(selectedEmail.sender)}</p>
                    <p style={s.detailEmail}>{selectedEmail.sender}</p>
                  </div>
                  <span style={s.detailDate}>{formatDate(selectedEmail.received_at, true)}</span>
                </div>
                <h2 style={s.detailSubject}>{selectedEmail.subject || "(no subject)"}</h2>
              </div>

              <div style={s.detailBody}>
                <pre style={s.emailBody}>{selectedEmail.body_text || "(empty)"}</pre>
              </div>

              <div style={s.detailActions}>
                <button
                  id={`reply-btn-${selectedEmail.id}`}
                  onClick={() => {
                    sessionStorage.setItem("ai_agent_email_data", JSON.stringify(selectedEmail));
                    router.push(`/reply?id=${selectedEmail.gmail_id || selectedEmail.id}`);
                  }}
                  style={s.replyBtn}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 12 5-5v3h7a4 4 0 0 1 4 4v3" /><path d="m3 12 5 5" />
                  </svg>
                  Generate AI Reply
                </button>
                <div style={{
                  ...s.statusBadge,
                  ...(selectedEmail.status === "replied" || selectedEmail.status === "answered" ? s.badgeReplied : s.badgeUnread),
                }}>
                  {selectedEmail.status === "replied" || selectedEmail.status === "answered" ? "Replied" : "Unread"}
                </div>
              </div>
            </div>
          ) : (
            <div style={s.noSelection}>
              <div style={s.noSelIcon}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#2d3347" }}>
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
              <p style={s.noSelTitle}>Select an email</p>
              <p style={s.noSelDesc}>Click any email on the left to read and reply</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", height: "100vh", background: "#0a0c12", color: "#e8eaf0", fontFamily: "Inter, sans-serif", overflow: "hidden" },
  center: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0c12" },
  spinner: { width: "24px", height: "24px", border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "#4f7ef8", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  toast: { position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", padding: "10px 20px", borderRadius: "10px", border: "1px solid", zIndex: 9999, fontSize: "13px", fontFamily: "Inter, sans-serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" },

  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: "56px", background: "rgba(18,21,28,0.8)", borderBottom: "1px solid rgba(35,40,64,0.5)", flexShrink: 0, gap: "12px", backdropFilter: "blur(12px)" },
  headerLeft: { display: "flex", alignItems: "center", gap: "10px", minWidth: "160px" },
  headerCenter: { display: "flex", alignItems: "center", justifyContent: "center", flex: 1 },
  headerRight: { display: "flex", alignItems: "center", gap: "6px", minWidth: "160px", justifyContent: "flex-end" },
  logoSmall: { width: "30px", height: "30px", background: "rgba(79,126,248,0.12)", border: "1px solid rgba(79,126,248,0.2)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" },
  appName: { fontSize: "14px", fontWeight: 600, color: "#e8eaf0" },
  connectedPill: { display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: "99px" },
  greenDot: { width: "6px", height: "6px", background: "#22c55e", borderRadius: "50%", boxShadow: "0 0 6px rgba(34,197,94,0.4)", flexShrink: 0 },
  connectBtn: { display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "rgba(79,126,248,0.1)", border: "1px solid rgba(79,126,248,0.25)", borderRadius: "8px", color: "#7aa4ff", fontSize: "12px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" },
  iconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", background: "transparent", border: "1px solid rgba(35,40,64,0.5)", borderRadius: "8px", color: "#6b7191", cursor: "pointer", transition: "all 0.15s" },
  avatarWrap: { width: "30px", height: "30px", borderRadius: "50%", overflow: "hidden", border: "2px solid rgba(35,40,64,0.5)", flexShrink: 0 },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  avatarFallback: { width: "100%", height: "100%", background: "#4f7ef8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "#fff" },

  body: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: { width: "340px", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(35,40,64,0.4)", background: "rgba(15,17,24,0.6)" },
  sidebarTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid rgba(35,40,64,0.3)" },
  sidebarTitle: { fontSize: "12px", fontWeight: 600, color: "#6b7191", letterSpacing: "0.5px", textTransform: "uppercase" },
  emailCount: { fontSize: "11px", padding: "2px 7px", background: "rgba(79,126,248,0.12)", color: "#7aa4ff", borderRadius: "99px", fontWeight: 600 },
  emailList: { flex: 1, overflowY: "auto" },

  emailItem: { display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid rgba(26,31,46,0.5)", transition: "background 0.1s", position: "relative" },
  emailItemActive: { background: "rgba(26,32,53,0.6)" },
  emailAvatar: { width: "34px", height: "34px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: "2px" },
  emailMeta: { flex: 1, minWidth: 0 },
  emailTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  emailSender: { fontSize: "13px", fontWeight: 600, color: "#c8cce0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  emailTime: { fontSize: "11px", color: "#4a5170", flexShrink: 0 },
  emailSubject: { margin: "3px 0 0", fontSize: "12px", color: "#8b91a8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 },
  emailSnippet: { margin: "2px 0 0", fontSize: "11px", color: "#4a5170", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  unreadDot: { width: "6px", height: "6px", background: "#4f7ef8", borderRadius: "50%", flexShrink: 0, marginTop: "8px", boxShadow: "0 0 8px rgba(79,126,248,0.5)" },

  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 20px", gap: "12px" },
  emptyIcon: { opacity: 0.5 },
  emptyTitle: { margin: 0, fontSize: "14px", fontWeight: 600, color: "#6b7191" },
  emptyDesc: { margin: 0, fontSize: "12px", color: "#4a5170", textAlign: "center", lineHeight: 1.5 },
  emptyConnectBtn: { display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "rgba(79,126,248,0.1)", border: "1px solid rgba(79,126,248,0.25)", borderRadius: "8px", color: "#7aa4ff", fontSize: "12px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginTop: "4px" },
  emptySyncBtn: { display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#4f7ef8", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },

  detail: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" },
  detailInner: { padding: "28px 36px", maxWidth: "760px", width: "100%", margin: "0 auto" },
  detailHeader: { borderBottom: "1px solid rgba(35,40,64,0.4)", paddingBottom: "20px", marginBottom: "20px" },
  detailSubject: { margin: "16px 0 0", fontSize: "22px", fontWeight: 700, color: "#e8eaf0", lineHeight: 1.3 },
  detailMeta: { display: "flex", alignItems: "center", gap: "12px" },
  senderAvatar: { width: "38px", height: "38px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: 700, color: "#fff", flexShrink: 0 },
  detailSender: { margin: 0, fontSize: "14px", fontWeight: 600, color: "#c8cce0" },
  detailEmail: { margin: "2px 0 0", fontSize: "12px", color: "#555d78" },
  detailDate: { marginLeft: "auto", fontSize: "12px", color: "#4a5170", whiteSpace: "nowrap" },
  detailBody: { background: "rgba(24,28,38,0.6)", border: "1px solid rgba(35,40,64,0.3)", borderRadius: "12px", padding: "20px 24px", marginBottom: "24px" },
  emailBody: { margin: 0, fontSize: "14px", color: "#b0b4cc", lineHeight: 1.7, fontFamily: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  detailActions: { display: "flex", alignItems: "center", gap: "12px" },
  replyBtn: { display: "flex", alignItems: "center", gap: "8px", background: "#4f7ef8", color: "#fff", border: "none", borderRadius: "10px", padding: "10px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "background 0.2s", fontFamily: "inherit", boxShadow: "0 0 20px rgba(79,126,248,0.15)" },
  statusBadge: { padding: "4px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 500 },
  badgeUnread: { background: "rgba(79,126,248,0.1)", color: "#7aa4ff" },
  badgeReplied: { background: "rgba(34,197,94,0.1)", color: "#4ade80" },

  noSelection: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" },
  noSelIcon: { opacity: 0.4 },
  noSelTitle: { margin: 0, fontSize: "15px", fontWeight: 600, color: "#6b7191" },
  noSelDesc: { margin: 0, fontSize: "13px", color: "#4a5170" },
};
