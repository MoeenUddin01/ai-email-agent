"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/utils/supabase";

interface DraftResult {
  draft_content: string;
  model_used: string;
  retrieved_context?: { documents?: { content: string; similarity: number }[] };
  token_info?: { estimated_prompt_tokens: number; max_context_window: number; usage_pct: number };
}

function ReplyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailId = searchParams.get("id") || "";

  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmailId, setSentEmailId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hoverRating, setHoverRating] = useState(0);
  const [error, setError] = useState("");
  const hasFetched = useRef(false);

  const getToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  useEffect(() => {
    const bootstrap = async () => {
      if (hasFetched.current) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
          subscription.unsubscribe();
          if (s) {
            hasFetched.current = true;
            generateDraft();
          } else {
            router.push("/");
          }
        });
        return;
      }

      hasFetched.current = true;
      generateDraft();
    };

    bootstrap();
  }, [emailId]);

  const generateDraft = async () => {
    setGenerating(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) { router.push("/"); return; }

      const stored = sessionStorage.getItem("ai_agent_email_data");
      const emailData = stored ? JSON.parse(stored) : null;

      let res: Response;
      if (emailData) {
        res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/emails/process-direct`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              sender: emailData.sender ?? "",
              subject: emailData.subject ?? "",
              body_text: emailData.body_text ?? "",
            }),
          }
        );
      } else {
        res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/emails/${emailId}/process`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } }
        );
      }

      if (res.ok) {
        const data = await res.json();
        if (!data.draft_content) {
          setError("AI returned an empty draft. Please try regenerating.");
        } else {
          setDraft({
            draft_content: data.draft_content,
            model_used: data.model_used ?? "AI",
            retrieved_context: data.retrieved_context,
            token_info: data.token_info,
          });
          setEditedContent(data.draft_content);
        }
      } else {
        let detail = `Error ${res.status}`;
        try { const err = await res.json(); detail = err.detail || detail; } catch { /* ignore */ }
        setError(`Failed to generate draft: ${detail}`);
      }
    } catch (e) {
      setError(`Network error: ${String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!draft || !editedContent.trim()) return;
    setSending(true);
    try {
      const token = await getToken();
      if (!token) return;
      const stored = sessionStorage.getItem("ai_agent_email_data");
      const emailData = stored ? JSON.parse(stored) : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/drafts/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email_id: emailId,
          final_content: editedContent,
          recipient: emailData?.sender || "",
          subject: emailData?.subject || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSentEmailId(data.sent_email?.id ?? null);
        setSent(true);
      } else {
        let detail = `Error ${res.status}`;
        try { const err = await res.json(); detail = err.detail || detail; } catch { /* ignore */ }
        setError(`Failed to send: ${detail}`);
      }
    } catch (e) {
      setError(`Network error: ${String(e)}`);
    } finally {
      setSending(false);
    }
  };

  const handleFeedback = async () => {
    if (sentEmailId && rating > 0) {
      const token = await getToken();
      if (token) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/feedback/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              sent_email_id: sentEmailId,
              star_rating: rating,
              text_feedback: feedback || null,
            }),
          });
        } catch { /* best-effort */ }
      }
    }
    router.push("/inbox");
  };

  if (generating) {
    return (
      <div style={s.center}>
        <div style={s.loadingCard}>
          <div style={s.spinnerLg} />
          <p style={s.loadTitle}>Crafting your reply</p>
          <p style={s.loadDesc}>AI is reading the email and searching the knowledge base</p>
          <div style={s.loadBar}>
            <div style={s.loadBarFill} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <header style={s.header}>
        <button id="back-btn" onClick={() => router.push("/inbox")} style={s.backBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          Back
        </button>
        <span style={s.headerTitle}>Review &amp; Send Reply</span>
        <div style={{ width: "100px" }} />
      </header>

      <div style={s.page}>
        <div style={{ ...s.container, maxWidth: sent ? "560px" : "1100px" }}>
          {error && (
            <div style={s.errorBanner}>
              <span>{error}</span>
              <button onClick={generateDraft} style={s.retryBtn}>Retry</button>
            </div>
          )}

          {sent ? (
            <div className="animate-fade-in" style={s.feedbackCard}>
              <div style={s.sentCircle}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={s.feedbackTitle}>Email Sent!</h2>
              <p style={s.feedbackDesc}>How would you rate this AI-generated reply?</p>

              <div style={s.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    id={`star-${star}`}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                      fontSize: "36px",
                      color: star <= (hoverRating || rating) ? "#f59e0b" : "#E0E0E0",
                      transition: "color 0.15s, transform 0.15s",
                      transform: star <= (hoverRating || rating) ? "scale(1.15)" : "scale(1)",
                    }}
                  >★</button>
                ))}
              </div>

              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Optional: share feedback about the reply quality…"
                style={s.feedbackTextarea}
              />

              <button
                id="submit-feedback-btn"
                onClick={handleFeedback}
                disabled={rating === 0}
                style={{
                  ...s.primaryBtn,
                  opacity: rating === 0 ? 0.5 : 1,
                  width: "100%",
                  maxWidth: "300px",
                  cursor: rating === 0 ? "not-allowed" : "pointer",
                }}
              >
                Submit &amp; Done
              </button>
            </div>
          ) : draft ? (
            <div style={s.splitLayout}>
              <div style={s.editorColumn}>
                <div style={s.metaBar}>
                  <div style={s.metaBadge}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                    </svg>
                    AI Draft · {draft.model_used}
                  </div>
                </div>

                <div style={s.editorCard}>
                  <div style={s.editorToolbar}>
                    <span style={s.editorLabel}>Edit your reply</span>
                    <span style={s.charCount}>{editedContent.length} chars</span>
                  </div>
                  <textarea
                    id="reply-editor"
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    style={s.textarea}
                    placeholder="Your reply…"
                  />
                </div>

                <div style={s.actions}>
                  <button
                    id="send-btn"
                    onClick={handleSend}
                    disabled={sending || !editedContent.trim()}
                    style={{
                      ...s.primaryBtn,
                      opacity: sending || !editedContent.trim() ? 0.6 : 1,
                      cursor: sending ? "not-allowed" : "pointer",
                    }}
                  >
                    {sending ? (
                      <><div style={s.spinnerSm} /> Sending…</>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                        Approve &amp; Send
                      </>
                    )}
                  </button>
                  <button id="regenerate-btn" onClick={generateDraft} style={s.secondaryBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Regenerate
                  </button>
                </div>
              </div>

              <div style={s.contextColumn}>
                <div style={s.contextHeader}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  Knowledge Sources
                  {draft.retrieved_context?.documents?.length ? (
                    <span style={s.contextCount}>{draft.retrieved_context.documents.length}</span>
                  ) : null}
                </div>
                {draft.token_info ? (
                  <div style={s.tokenBar}>
                    <div style={s.tokenRow}>
                      <span style={s.tokenLabel}>Prompt tokens</span>
                      <span style={s.tokenValue}>~{draft.token_info.estimated_prompt_tokens.toLocaleString()}</span>
                    </div>
                    <div style={s.tokenRow}>
                      <span style={s.tokenLabel}>Model limit</span>
                      <span style={s.tokenValue}>{draft.token_info.max_context_window.toLocaleString()}</span>
                    </div>
                    <div style={s.tokenRow}>
                      <span style={s.tokenLabel}>Context used</span>
                      <span style={{
                        ...s.tokenValue,
                        color: draft.token_info.usage_pct > 80 ? "#DC2626" : draft.token_info.usage_pct > 50 ? "#D97706" : "#16A34A",
                      }}>
                        {draft.token_info.usage_pct}%
                      </span>
                    </div>
                    <div style={s.tokenBarBg}>
                      <div style={{
                        ...s.tokenBarFill,
                        width: `${Math.min(draft.token_info.usage_pct, 100)}%`,
                        background: draft.token_info.usage_pct > 80 ? "#DC2626" : draft.token_info.usage_pct > 50 ? "#D97706" : "#16A34A",
                      }} />
                    </div>
                  </div>
                ) : null}
                <div style={s.contextList}>
                  {draft.retrieved_context?.documents?.length ? (
                    draft.retrieved_context.documents.map((doc, i) => (
                      <div key={i} style={s.contextDoc}>
                        <div style={s.contextDocHeader}>
                          <span style={s.contextDocNum}>#{i + 1}</span>
                          <span style={s.contextScore}>
                            {Math.round((doc.similarity || 0) * 100)}% match
                          </span>
                        </div>
                        <p style={s.contextDocText}>{doc.content}</p>
                      </div>
                    ))
                  ) : (
                    <p style={s.contextEmpty}>No context was used for this reply.</p>
                  )}
                </div>
              </div>
            </div>
          ) : !error ? (
            <div style={s.center}>
              <p style={{ color: "#999", marginBottom: "12px" }}>Generation failed silently. Please retry.</p>
              <button onClick={generateDraft} style={s.primaryBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Try Again
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ReplyPage() {
  return (
    <Suspense fallback={
      <div style={s.center}>
        <div style={s.loadingCard}>
          <div style={s.spinnerLg} />
          <p style={s.loadTitle}>Loading…</p>
        </div>
      </div>
    }>
      <ReplyPageInner />
    </Suspense>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", height: "100vh", background: "#FAFAF8", color: "var(--dark)", fontFamily: "Inter, sans-serif" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, background: "#FAFAF8" },

  loadingCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "48px 36px", background: "white", border: "1px solid var(--border)", borderRadius: 16, maxWidth: 380, textAlign: "center", boxShadow: "var(--shadow-md)" },
  spinnerLg: { width: 40, height: 40, border: "3px solid var(--gray-light)", borderTopColor: "var(--orange)", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  spinnerSm: { width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loadTitle: { margin: 0, fontSize: 16, fontWeight: 600, color: "var(--dark)" },
  loadDesc: { margin: 0, fontSize: 12, color: "var(--text-muted)" },
  loadBar: { width: 200, height: 3, background: "var(--gray-light)", borderRadius: 99, overflow: "hidden" },
  loadBarFill: { width: "60%", height: "100%", background: "var(--orange)", borderRadius: 99, animation: "shimmer 1.5s infinite", backgroundImage: "linear-gradient(90deg, var(--orange), #FF8A3F, var(--orange))", backgroundSize: "200% 100%" },

  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56, background: "white", borderBottom: "1px solid var(--border)", flexShrink: 0 },
  backBtn: { display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  headerTitle: { fontSize: 14, fontWeight: 600, color: "var(--dark)" },

  page: { flex: 1, overflowY: "auto", padding: "32px 24px" },
  container: { maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 },

  errorBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#DC2626", fontSize: 13 },
  retryBtn: { background: "transparent", border: "1px solid #FECACA", borderRadius: 6, padding: "4px 10px", color: "#DC2626", cursor: "pointer", fontSize: 12, fontFamily: "inherit" },

  metaBar: { display: "flex", alignItems: "center", gap: 12 },
  metaBadge: { display: "flex", alignItems: "center", gap: 6, padding: "5px 14px", background: "#FFF0E8", border: "1px solid rgba(255,104,3,0.15)", borderRadius: 999, fontSize: 12, color: "var(--orange)", fontWeight: 500, width: "fit-content" },

  splitLayout: { display: "flex", gap: 20, alignItems: "flex-start" },
  editorColumn: { flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  contextColumn: { width: 340, flexShrink: 0, background: "white", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", maxHeight: "calc(100vh - 140px)", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-sm)" },
  contextHeader: { display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", background: "var(--gray-bg)" },
  contextCount: { marginLeft: "auto", background: "var(--gray-light)", color: "var(--text-muted)", borderRadius: 999, padding: "0 8px", fontSize: 11, lineHeight: "20px", fontWeight: 500 },
  contextList: { overflowY: "auto", flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 },
  contextDoc: { background: "var(--gray-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px" },
  contextDocHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  contextDocNum: { fontSize: 11, fontWeight: 600, color: "var(--orange)", background: "#FFF0E8", padding: "2px 8px", borderRadius: 4 },
  contextScore: { fontSize: 11, color: "#16A34A", fontWeight: 500 },
  contextDocText: { margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  contextEmpty: { fontSize: 13, color: "var(--text-muted)", padding: 24, textAlign: "center" },

  tokenBar: { padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6, background: "white" },
  tokenRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 },
  tokenLabel: { color: "var(--text-muted)" },
  tokenValue: { color: "var(--text-primary)", fontWeight: 500 },
  tokenBarBg: { height: 4, background: "var(--gray-light)", borderRadius: 2, overflow: "hidden", marginTop: 2 },
  tokenBarFill: { height: "100%", borderRadius: 2, transition: "width 0.3s" },

  editorCard: { background: "white", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-sm)" },
  editorToolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--gray-bg)" },
  editorLabel: { fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" },
  charCount: { fontSize: 11, color: "var(--text-muted)" },
  textarea: { width: "100%", minHeight: 340, padding: 16, background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },

  actions: { display: "flex", alignItems: "center", gap: 12 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 8, background: "var(--orange)", color: "#fff", border: "none", borderRadius: 999, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(255,104,3,0.3)" },
  secondaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 999, padding: "11px 18px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },

  feedbackCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "52px 32px", background: "white", border: "1px solid var(--border)", borderRadius: 16, textAlign: "center", boxShadow: "var(--shadow-md)" },
  sentCircle: { width: 56, height: 56, borderRadius: "50%", background: "#F0FDF4", border: "2px solid #BBF7D0", display: "flex", alignItems: "center", justifyContent: "center" },
  feedbackTitle: { margin: 0, fontSize: 22, fontWeight: 700, color: "var(--dark)" },
  feedbackDesc: { margin: 0, fontSize: 14, color: "var(--text-muted)" },
  stars: { display: "flex", gap: 4 },
  feedbackTextarea: { width: "100%", maxWidth: 440, height: 90, padding: 12, background: "var(--gray-bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text-primary)", fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit" },
};
