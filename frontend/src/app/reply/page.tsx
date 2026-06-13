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
          <div style={s.loadBar}><div style={s.loadBarFill} /></div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <header style={s.header}>
        <button id="back-btn" onClick={() => router.push("/inbox")} style={s.backBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
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
            <div style={s.feedbackCard}>
              <div style={s.sentCircle}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
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
                      fontSize: "32px",
                      color: star <= (hoverRating || rating) ? "#f59e0b" : "#2d3347",
                      transition: "color 0.15s, transform 0.15s",
                      transform: star <= (hoverRating || rating) ? "scale(1.1)" : "scale(1)",
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
                style={{ ...s.primaryBtn, opacity: rating === 0 ? 0.5 : 1, width: "100%", maxWidth: "300px" }}
              >
                Submit &amp; Done
              </button>
            </div>
          ) : draft ? (
            <div style={s.splitLayout}>
              <div style={s.editorColumn}>
                <div style={s.metaBar}>
                  <div style={s.metaBadge}>
                    <span>✦</span> AI Draft · {draft.model_used}
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
                    ↺ Regenerate
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
                        color: draft.token_info.usage_pct > 80 ? "#f87171" : draft.token_info.usage_pct > 50 ? "#fbbf24" : "#22c55e",
                      }}>
                        {draft.token_info.usage_pct}%
                      </span>
                    </div>
                    <div style={s.tokenBarBg}>
                      <div style={{
                        ...s.tokenBarFill,
                        width: `${Math.min(draft.token_info.usage_pct, 100)}%`,
                        background: draft.token_info.usage_pct > 80 ? "#f87171" : draft.token_info.usage_pct > 50 ? "#fbbf24" : "#22c55e",
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
              <p style={{ color: "#6b7191", marginBottom: "12px" }}>Generation failed silently. Please retry.</p>
              <button onClick={generateDraft} style={s.primaryBtn}>↺ Try Again</button>
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
  root: { display: "flex", flexDirection: "column", height: "100vh", background: "#0a0c12", color: "#e8eaf0", fontFamily: "Inter, sans-serif" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "16px", background: "#0a0c12" },

  loadingCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "48px", background: "rgba(24,28,38,0.6)", border: "1px solid rgba(35,40,64,0.3)", borderRadius: "16px", maxWidth: "380px", textAlign: "center" },
  spinnerLg: { width: "40px", height: "40px", border: "3px solid rgba(79,126,248,0.15)", borderTopColor: "#4f7ef8", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  spinnerSm: { width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loadTitle: { margin: 0, fontSize: "16px", fontWeight: 600, color: "#e8eaf0" },
  loadDesc: { margin: 0, fontSize: "12px", color: "#6b7191" },
  loadBar: { width: "200px", height: "3px", background: "rgba(35,40,64,0.5)", borderRadius: "99px", overflow: "hidden" },
  loadBarFill: { width: "60%", height: "100%", background: "#4f7ef8", borderRadius: "99px", animation: "shimmer 1.5s infinite", backgroundImage: "linear-gradient(90deg, #4f7ef8, #7aa4ff, #4f7ef8)", backgroundSize: "200% 100%" },

  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: "56px", background: "rgba(18,21,28,0.8)", borderBottom: "1px solid rgba(35,40,64,0.5)", flexShrink: 0, backdropFilter: "blur(12px)" },
  backBtn: { display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: "1px solid rgba(35,40,64,0.5)", borderRadius: "8px", padding: "6px 14px", color: "#6b7191", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" },
  headerTitle: { fontSize: "14px", fontWeight: 600, color: "#e8eaf0" },

  page: { flex: 1, overflowY: "auto", padding: "32px 24px" },
  container: { maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" },

  errorBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", color: "#fca5a5", fontSize: "13px" },
  retryBtn: { background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", padding: "4px 10px", color: "#fca5a5", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" },

  metaBar: { display: "flex", alignItems: "center", gap: "12px" },
  metaBadge: { display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", background: "rgba(79,126,248,0.1)", border: "1px solid rgba(79,126,248,0.15)", borderRadius: "99px", fontSize: "12px", color: "#7aa4ff", fontWeight: 500, width: "fit-content" },

  splitLayout: { display: "flex", gap: "20px", alignItems: "flex-start" },
  editorColumn: { flex: 1, display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 },
  contextColumn: { width: "340px", flexShrink: 0, background: "rgba(24,28,38,0.6)", border: "1px solid rgba(35,40,64,0.3)", borderRadius: "12px", overflow: "hidden", maxHeight: "calc(100vh - 140px)", display: "flex", flexDirection: "column" },
  contextHeader: { display: "flex", alignItems: "center", gap: "8px", padding: "14px 16px", borderBottom: "1px solid rgba(35,40,64,0.3)", fontSize: "13px", fontWeight: 600, color: "#8b91a8", background: "rgba(18,21,28,0.5)" },
  contextCount: { marginLeft: "auto", background: "rgba(35,40,64,0.5)", color: "#6b7191", borderRadius: "99px", padding: "0 8px", fontSize: "11px", lineHeight: "20px", fontWeight: 500 },
  contextList: { overflowY: "auto", flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", gap: "10px" },
  contextDoc: { background: "rgba(18,21,28,0.5)", border: "1px solid rgba(35,40,64,0.2)", borderRadius: "8px", padding: "12px" },
  contextDocHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" },
  contextDocNum: { fontSize: "11px", fontWeight: 600, color: "#4f7ef8", background: "rgba(79,126,248,0.08)", padding: "2px 8px", borderRadius: "4px" },
  contextScore: { fontSize: "11px", color: "#22c55e", fontWeight: 500 },
  contextDocText: { margin: 0, fontSize: "12px", color: "#6b7191", lineHeight: "1.6", whiteSpace: "pre-wrap" },
  contextEmpty: { fontSize: "13px", color: "#4a5170", padding: "24px", textAlign: "center" },

  tokenBar: { padding: "10px 16px", borderBottom: "1px solid rgba(35,40,64,0.3)", display: "flex", flexDirection: "column", gap: "6px", background: "rgba(10,12,18,0.5)" },
  tokenRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" },
  tokenLabel: { color: "#555d78" },
  tokenValue: { color: "#b0b4cc", fontWeight: 500 },
  tokenBarBg: { height: "4px", background: "rgba(35,40,64,0.5)", borderRadius: "2px", overflow: "hidden", marginTop: "2px" },
  tokenBarFill: { height: "100%", borderRadius: "2px", transition: "width 0.3s" },

  editorCard: { background: "rgba(24,28,38,0.6)", border: "1px solid rgba(35,40,64,0.3)", borderRadius: "12px", overflow: "hidden" },
  editorToolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(35,40,64,0.3)", background: "rgba(18,21,28,0.5)" },
  editorLabel: { fontSize: "12px", fontWeight: 500, color: "#6b7191" },
  charCount: { fontSize: "11px", color: "#4a5170" },
  textarea: { width: "100%", minHeight: "340px", padding: "16px", background: "transparent", border: "none", outline: "none", color: "#c8cce0", fontSize: "14px", lineHeight: "1.7", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },

  actions: { display: "flex", alignItems: "center", gap: "12px" },
  primaryBtn: { display: "flex", alignItems: "center", gap: "8px", background: "#4f7ef8", color: "#fff", border: "none", borderRadius: "10px", padding: "11px 22px", fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "background 0.2s", fontFamily: "inherit", boxShadow: "0 0 20px rgba(79,126,248,0.15)" },
  secondaryBtn: { display: "flex", alignItems: "center", gap: "6px", background: "transparent", color: "#6b7191", border: "1px solid rgba(35,40,64,0.5)", borderRadius: "10px", padding: "11px 18px", fontSize: "14px", cursor: "pointer", transition: "background 0.15s", fontFamily: "inherit" },

  feedbackCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "52px 32px", background: "rgba(24,28,38,0.6)", border: "1px solid rgba(35,40,64,0.3)", borderRadius: "16px", textAlign: "center" },
  sentCircle: { width: "56px", height: "56px", borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center" },
  feedbackTitle: { margin: 0, fontSize: "22px", fontWeight: 700, color: "#e8eaf0" },
  feedbackDesc: { margin: 0, fontSize: "14px", color: "#6b7191" },
  stars: { display: "flex", gap: "4px" },
  feedbackTextarea: { width: "100%", maxWidth: "440px", height: "90px", padding: "12px", background: "rgba(18,21,28,0.5)", border: "1px solid rgba(35,40,64,0.3)", borderRadius: "10px", color: "#c8cce0", fontSize: "13px", resize: "none", outline: "none", fontFamily: "inherit" },
};
