"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { router.push("/inbox"); return; }
      } catch {}
      setIsLoading(false);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) router.push("/inbox");
      else if (event === "SIGNED_OUT") setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000"}/auth/callback`,
        },
      });
    } catch { setIsSigningIn(false); }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--white)" }}>
        <div className="animate-spin-slow" style={{ width: 24, height: 24, border: "2px solid var(--gray)", borderTopColor: "var(--orange)", borderRadius: "50%" }} />
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--white)", position: "relative", overflow: "hidden" }}>
      {/* Navbar */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: 64,
        borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "var(--orange)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" /><path d="M14 22H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10" /><path d="M18 14v8" /><path d="M22 18h-8" />
            </svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--dark)" }}>AI Email Agent</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {["Home", "Dashboard", "Knowledge Base", "Settings"].map((item) => (
            <button key={item} style={{
              padding: "6px 16px", borderRadius: 999,
              border: "none", background: item === "Home" ? "var(--orange)" : "transparent",
              color: item === "Home" ? "white" : "var(--text-secondary)",
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s",
            }}>{item}</button>
          ))}
        </div>

        <button
          id="google-signin-btn"
          onClick={handleLogin}
          disabled={isSigningIn}
          style={{
            padding: "8px 20px", borderRadius: 999,
            background: "var(--dark)", color: "white",
            border: "none", fontSize: 13, fontWeight: 600,
            cursor: isSigningIn ? "not-allowed" : "pointer",
            fontFamily: "inherit", transition: "opacity 0.15s",
            opacity: isSigningIn ? 0.7 : 1,
          }}
        >
          {isSigningIn ? "Signing in..." : "Login / Register"}
        </button>
      </nav>

      {/* Hero section */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 40px", position: "relative" }}>
        {/* Pixelated background text */}
        <div className="font-pixel" style={{
          position: "absolute", top: 20, right: 0, left: 0,
          fontSize: 140, lineHeight: 1,
          color: "rgba(191,191,191,0.12)",
          pointerEvents: "none", userSelect: "none",
          textAlign: "center", letterSpacing: 4,
          whiteSpace: "nowrap", overflow: "hidden",
        }}>AI AGENT</div>

        <div style={{ display: "flex", gap: 60, alignItems: "flex-start", position: "relative" }}>
          {/* Left column: text + CTAs */}
          <div style={{ flex: 1, paddingTop: 40 }}>
            <h1 style={{
              fontSize: 56, fontWeight: 900, lineHeight: 1.08,
              color: "var(--dark)", margin: 0, letterSpacing: "-1.5px",
            }}>
              SMART EMAIL<br />REPLIES ON<br />
              <span style={{ color: "var(--orange)" }}>AUTOPILOT</span>
            </h1>
            <p style={{
              fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.6,
              margin: "20px 0 28px", maxWidth: 440,
            }}>
              AI-powered Gmail replies grounded in your course knowledge base.
              Review, edit, and approve every draft — never auto-sends.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={handleLogin}
                disabled={isSigningIn}
                style={{
                  padding: "14px 32px", borderRadius: 999,
                  background: "var(--orange)", color: "white",
                  border: "none", fontSize: 15, fontWeight: 600,
                  cursor: isSigningIn ? "not-allowed" : "pointer",
                  fontFamily: "inherit", transition: "background 0.15s",
                  boxShadow: "0 4px 24px rgba(255,104,3,0.35)",
                  opacity: isSigningIn ? 0.7 : 1,
                }}
              >Get Started</button>
              <button style={{
                padding: "14px 32px", borderRadius: 999,
                background: "var(--gray)", color: "var(--dark)",
                border: "none", fontSize: 15, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}>View Docs</button>
            </div>

            {/* Floating UI elements */}
            <div style={{ display: "flex", gap: 16, marginTop: 48, position: "relative" }}>
              {/* Terminal/knowledge base window */}
              <div className="animate-float" style={{
                background: "var(--dark)", borderRadius: 12, padding: 16,
                width: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
              }}>
                <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF5F56" }} />
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFBD2E" }} />
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#27C93F" }} />
                </div>
                <div style={{ fontSize: 11, color: "#BFBFBF", fontFamily: "monospace", lineHeight: 1.8 }}>
                  <span style={{ color: "#27C93F" }}>$</span> rag search "data science courses"<br />
                  <span style={{ color: "#FF6803" }}>→</span> Found 3 matches<br />
                  <span style={{ color: "#27C93F" }}>$</span> generating reply...
                </div>
              </div>

              {/* Floating envelope icon */}
              <div className="animate-float-delayed" style={{
                position: "absolute", left: 220, top: -10,
                width: 44, height: 44, borderRadius: 12,
                background: "var(--orange)", display: "flex",
                alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 16px rgba(255,104,3,0.3)",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Right column: Stats + Inbox preview */}
          <div style={{ width: 340, paddingTop: 40, position: "relative" }}>
            {/* Stats card */}
            <div className="glass animate-float-delayed" style={{
              padding: "20px 24px", marginBottom: 24,
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: "var(--orange)", lineHeight: 1 }}>
                ↑ 10x FASTER
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                Reduce hours spent on repetitive student queries
              </div>
            </div>

            {/* Inbox preview window */}
            <div className="animate-float" style={{
              borderRadius: 14, overflow: "hidden",
              boxShadow: "0 8px 40px rgba(0,0,0,0.1)",
              border: "1px solid var(--border)",
              background: "white",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>INBOX</span>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 999,
                  background: "var(--orange)", color: "white", fontWeight: 600,
                }}>3 new</span>
              </div>
              {[
                { name: "Sarah Johnson", subj: "Question about Data Science", time: "10:30 AM" },
                { name: "Mike Chen", subj: "Team training inquiry", time: "9:15 AM" },
                { name: "David Kim", subj: "Curriculum partnership", time: "Yesterday" },
              ].map((item, i) => (
                <div key={i} style={{
                  padding: "10px 16px", borderBottom: i < 2 ? "1px solid var(--border)" : "none",
                  display: "flex", gap: 10, alignItems: "center",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: `hsl(${i * 40 + 20}, 70%, 60%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>{item.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dark)" }}>{item.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.time}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                      {item.subj}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Sparkle icon */}
            <div className="animate-float" style={{
              position: "absolute", right: -20, top: 180,
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--orange)", opacity: 0.2,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--orange)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            </div>
          </div>
        </div>

        {/* Bottom features bar */}
        <div style={{
          display: "flex", gap: 0, marginTop: 80,
          borderTop: "1px solid var(--border)", paddingTop: 32,
          justifyContent: "space-around",
        }}>
          {[
            { stat: "150+", label: "Course Docs" },
            { stat: "3 LLMs", label: "Groq · Gemini · OpenAI" },
            { stat: "Zero", label: "Auto-sends (always approve)" },
          ].map((f) => (
            <div key={f.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--orange)" }}>{f.stat}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid var(--border)", padding: "20px 40px",
        textAlign: "center", fontSize: 12, color: "var(--text-muted)",
      }}>
        Built with Next.js · FastAPI · Supabase · pgvector · Groq
      </div>
    </main>
  );
}
