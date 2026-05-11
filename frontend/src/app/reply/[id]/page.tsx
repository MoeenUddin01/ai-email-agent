"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/utils/supabase";

interface DraftResult {
  draft_content: string;
  model_used: string;
  retrieved_context?: { documents?: { content: string; similarity: number }[] };
}

export default function ReplyPage() {
  const router = useRouter();
  const params = useParams();
  const emailId = params.id as string;

  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
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
    // Wait for Supabase to restore session before generating
    const bootstrap = async () => {
      if (hasFetched.current) return;

      // getSession() is reliable after the client hydrates
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Subscribe once to catch the restored session
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

      // Read email data stored by the inbox page
      const stored = sessionStorage.getItem("ai_agent_email_data");
      const emailData = stored ? JSON.parse(stored) : null;

      let res: Response;
      if (emailData) {
        // Use the direct endpoint — no DB lookup needed for temp IDs
        res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/emails/process-direct`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              sender: emailData.sender,
              subject: emailData.subject,
              body_text: emailData.body_text,
            }),
          }
        );
      } else {
        // Fallback to DB-based endpoint for persisted emails
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
    router.push("/inbox");
  };

  // --- Loading ---
  if (generating) {
    return (
      <div style={S.fullCenter}>
        <div style={S.loadingCard}>
          <div style={S.spinnerLarge} />
          <p style={S.loadingTitle}>Crafting your reply…</p>
          <p style={S.loadingDesc}>AI is reading the email and searching the knowledge base</p>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <header style={S.header}>
        <button id="back-btn" onClick={() => router.push("/inbox")} style={S.backBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          Back to Inbox
        </button>
        <span style={S.headerTitle}>Review &amp; Send Reply</span>
        <div style={{ width: "120px" }} />
      </header>

      <div style={S.page}>
        <div style={S.container}>
          {error && (
            <div style={S.errorBanner}>
              <span>⚠️ {error}</span>
              <button onClick={generateDraft} style={S.retryBtn}>Retry</button>
            </div>
          )}

          {sent ? (
            /* Feedback section */
            <div style={S.feedbackCard}>
              <div style={S.sentIcon}>✅</div>
              <h2 style={S.feedbackTitle}>Email Sent!</h2>
              <p style={S.feedbackDesc}>How would you rate this AI-generated reply?</p>

              <div style={S.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    id={`star-${star}`}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", fontSize: "28px", color: star <= (hoverRating || rating) ? "#f59e0b" : "#2d3347", transition: "color 0.15s" }}
                  >
                    ★
                  </button>
                ))}
              </div>

              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Optional: share feedback about the reply quality…"
                style={S.feedbackTextarea}
              />

              <button
                id="submit-feedback-btn"
                onClick={handleFeedback}
                disabled={rating === 0}
                style={{ ...S.sendBtn, opacity: rating === 0 ? 0.5 : 1 }}
              >
                Submit &amp; Done
              </button>
            </div>
          ) : draft ? (
            <div style={S.draftWrapper}>
              {/* Meta info */}
              <div style={S.metaBar}>
                <div style={S.metaBadge}>
                  <span style={S.sparkle}>✦</span> AI Draft · {draft.model_used}
                </div>
                {draft.retrieved_context?.documents?.length ? (
                  <span style={S.contextNote}>
                    📚 {draft.retrieved_context.documents.length} knowledge sources used
                  </span>
                ) : null}
              </div>

              {/* Editor */}
              <div style={S.editorCard}>
                <div style={S.editorToolbar}>
                  <span style={S.editorLabel}>Edit your reply</span>
                  <span style={S.charCount}>{editedContent.length} chars</span>
                </div>
                <textarea
                  id="reply-editor"
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  style={S.textarea}
                  placeholder="Your reply…"
                />
              </div>

              {/* Actions */}
              <div style={S.actions}>
                <button
                  id="send-btn"
                  onClick={handleSend}
                  disabled={sending || !editedContent.trim()}
                  style={{ ...S.sendBtn, opacity: sending || !editedContent.trim() ? 0.6 : 1, cursor: sending ? "not-allowed" : "pointer" }}
                  onMouseEnter={(e) => { if (!sending) (e.currentTarget as HTMLButtonElement).style.background = "#5d8aff"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#4f7ef8"; }}
                >
                  {sending ? (
                    <><div style={S.spinnerSmall} /> Sending…</>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      Approve &amp; Send
                    </>
                  )}
                </button>
                <button
                  id="regenerate-btn"
                  onClick={generateDraft}
                  style={S.secondaryBtn}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1e2330")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  ↺ Regenerate
                </button>
              </div>
            </div>
          ) : !error ? (
            <div style={S.fullCenter}>
              <p style={{ color: "#8b91a8", marginBottom: "12px" }}>Generation failed silently. Please retry.</p>
              <button onClick={generateDraft} style={S.sendBtn}>↺ Try Again</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", height: "100vh", background: "#0d0f14", color: "#e8eaf0", fontFamily: "Inter, sans-serif" },
  fullCenter: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "16px", background: "#0d0f14" },

  loadingCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "48px", background: "#181c26", border: "1px solid #232840", borderRadius: "16px", maxWidth: "380px", textAlign: "center" },
  spinnerLarge: { width: "44px", height: "44px", border: "3px solid #232840", borderTopColor: "#4f7ef8", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loadingTitle: { margin: 0, fontSize: "17px", fontWeight: 600, color: "#e8eaf0" },
  loadingDesc: { margin: 0, fontSize: "13px", color: "#8b91a8" },

  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: "56px", background: "#12151c", borderBottom: "1px solid #232840", flexShrink: 0 },
  backBtn: { display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: "1px solid #232840", borderRadius: "8px", padding: "6px 14px", color: "#8b91a8", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" },
  headerTitle: { fontSize: "15px", fontWeight: 600, color: "#e8eaf0" },

  page: { flex: 1, overflowY: "auto" as const, padding: "32px 24px" },
  container: { maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" },

  errorBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#2d1a1a", border: "1px solid #7f1d1d", borderRadius: "10px", color: "#fca5a5", fontSize: "13px" },
  retryBtn: { background: "transparent", border: "1px solid #7f1d1d", borderRadius: "6px", padding: "4px 10px", color: "#fca5a5", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" },

  metaBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
  metaBadge: { display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", background: "rgba(79,126,248,0.12)", border: "1px solid rgba(79,126,248,0.2)", borderRadius: "99px", fontSize: "12px", color: "#7aa4ff", fontWeight: 500 },
  sparkle: { color: "#4f7ef8" },
  contextNote: { fontSize: "12px", color: "#555d78" },

  draftWrapper: { display: "flex", flexDirection: "column", gap: "16px" },
  editorCard: { background: "#181c26", border: "1px solid #232840", borderRadius: "12px", overflow: "hidden" },
  editorToolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #232840", background: "#12151c" },
  editorLabel: { fontSize: "12px", fontWeight: 500, color: "#8b91a8" },
  charCount: { fontSize: "11px", color: "#555d78" },
  textarea: { width: "100%", minHeight: "340px", padding: "16px", background: "transparent", border: "none", outline: "none", color: "#d0d4e4", fontSize: "14px", lineHeight: "1.7", resize: "vertical" as const, fontFamily: "inherit", boxSizing: "border-box" as const },

  actions: { display: "flex", alignItems: "center", gap: "12px" },
  sendBtn: { display: "flex", alignItems: "center", gap: "8px", background: "#4f7ef8", color: "#fff", border: "none", borderRadius: "10px", padding: "11px 22px", fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "background 0.2s", fontFamily: "inherit" },
  secondaryBtn: { display: "flex", alignItems: "center", gap: "6px", background: "transparent", color: "#8b91a8", border: "1px solid #232840", borderRadius: "10px", padding: "11px 18px", fontSize: "14px", cursor: "pointer", transition: "background 0.15s", fontFamily: "inherit" },
  spinnerSmall: { width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" },

  feedbackCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "48px 32px", background: "#181c26", border: "1px solid #232840", borderRadius: "16px", textAlign: "center" as const },
  sentIcon: { fontSize: "48px" },
  feedbackTitle: { margin: 0, fontSize: "22px", fontWeight: 700, color: "#e8eaf0" },
  feedbackDesc: { margin: 0, fontSize: "14px", color: "#8b91a8" },
  stars: { display: "flex", gap: "4px" },
  feedbackTextarea: { width: "100%", maxWidth: "440px", height: "90px", padding: "12px", background: "#12151c", border: "1px solid #232840", borderRadius: "10px", color: "#d0d4e4", fontSize: "13px", resize: "none" as const, outline: "none", fontFamily: "inherit" },
};
