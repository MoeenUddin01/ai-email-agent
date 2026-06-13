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
        if (user) {
          router.push("/inbox");
        } else {
          setIsLoading(false);
        }
      } catch {
        setIsLoading(false);
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        router.push("/inbox");
      } else if (event === "SIGNED_OUT") {
        setIsLoading(false);
      }
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
    } catch {
      setIsSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
      </div>
    );
  }

  return (
    <main style={s.page}>
      <div style={s.bgOrb1} />
      <div style={s.bgOrb2} />
      <div style={s.grain} />

      <div style={s.container}>
        <div style={s.badge}>v0.1 · Open Source</div>

        <div style={s.logoWrap}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#4f7ef8" }}>
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <path d="M14 22H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10" />
            <path d="M18 14v8" /><path d="M22 18h-8" />
            <path d="M6 6h.01" /><path d="M10 6h.01" /><path d="M14 6h.01" />
          </svg>
        </div>

        <h1 style={s.heading}>
          AI <span style={{ color: "#4f7ef8" }}>Email</span> Agent
        </h1>
        <p style={s.sub}>
          Intelligent Gmail replies, powered by AI &amp; your knowledge base.
          Never auto-sends — you always approve before it goes out.
        </p>

        <button
          id="google-signin-btn"
          onClick={handleLogin}
          disabled={isSigningIn}
          style={{
            ...s.btn,
            opacity: isSigningIn ? 0.7 : 1,
            cursor: isSigningIn ? "not-allowed" : "pointer",
          }}
        >
          {isSigningIn ? (
            <><div style={s.spinnerSmall} /> Signing in…</>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <div style={s.divider} />

        <div style={s.grid}>
          {[
            { icon: "inbox", title: "Gmail Integration", desc: "Sync your Primary inbox in one click — read-only access, always" },
            { icon: "zap", title: "AI-Powered Drafts", desc: "Groq/Gemini/OpenAI generates smart replies using your course data" },
            { icon: "search", title: "RAG Knowledge Base", desc: "150+ course docs in pgvector — retrieves relevant context for every reply" },
            { icon: "edit", title: "Review & Edit", desc: "Edit the draft before sending. The final say is always yours" },
            { icon: "star", title: "Feedback Loop", desc: "Rate replies 1-5 stars. Every rating improves future drafts" },
            { icon: "lock", title: "Never Auto-Sends", desc: "Each email requires explicit approval — a single button click" },
          ].map((f) => (
            <div key={f.title} style={s.card}>
              <div style={s.cardIcon}>
                {f.icon === "inbox" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>}
                {f.icon === "zap" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>}
                {f.icon === "search" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>}
                {f.icon === "edit" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>}
                {f.icon === "star" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                {f.icon === "lock" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}
              </div>
              <div>
                <p style={s.cardTitle}>{f.title}</p>
                <p style={s.cardDesc}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p style={s.footer}>Built with Next.js · FastAPI · Supabase · pgvector · Groq</p>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0c12",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
  },
  bgOrb1: {
    position: "absolute",
    top: "-20%",
    left: "-10%",
    width: "700px",
    height: "700px",
    background: "radial-gradient(circle, rgba(79,126,248,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  bgOrb2: {
    position: "absolute",
    bottom: "-20%",
    right: "-10%",
    width: "600px",
    height: "600px",
    background: "radial-gradient(circle, rgba(79,126,248,0.05) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  grain: {
    position: "absolute",
    inset: 0,
    opacity: 0.03,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
    pointerEvents: "none",
  },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0c12",
  },
  spinner: {
    width: "24px", height: "24px",
    border: "2px solid rgba(255,255,255,0.1)",
    borderTopColor: "#4f7ef8",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  spinnerSmall: {
    width: "16px", height: "16px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  container: {
    maxWidth: "520px",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0",
    position: "relative",
    zIndex: 1,
  },
  badge: {
    padding: "4px 12px",
    background: "rgba(79,126,248,0.1)",
    border: "1px solid rgba(79,126,248,0.2)",
    borderRadius: "99px",
    fontSize: "11px",
    color: "#7aa4ff",
    fontWeight: 500,
    letterSpacing: "0.3px",
    marginBottom: "24px",
  },
  logoWrap: {
    width: "52px",
    height: "52px",
    background: "rgba(79,126,248,0.12)",
    border: "1px solid rgba(79,126,248,0.25)",
    borderRadius: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
  },
  heading: {
    margin: 0,
    fontSize: "36px",
    fontWeight: 700,
    color: "#e8eaf0",
    letterSpacing: "-0.5px",
    lineHeight: 1.2,
    textAlign: "center",
  },
  sub: {
    margin: "12px 0 0",
    fontSize: "14px",
    color: "#6b7191",
    textAlign: "center",
    lineHeight: 1.7,
    maxWidth: "400px",
  },
  btn: {
    marginTop: "24px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    background: "#4f7ef8",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "14px 24px",
    fontSize: "15px",
    fontWeight: 600,
    transition: "background 0.2s, transform 0.15s",
    fontFamily: "inherit",
    boxShadow: "0 0 20px rgba(79,126,248,0.15)",
  },
  divider: {
    width: "100%",
    height: "1px",
    background: "linear-gradient(90deg, transparent, #232840, transparent)",
    margin: "28px 0",
  },
  grid: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "100%",
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    background: "transparent",
    borderRadius: "8px",
    transition: "background 0.15s",
  },
  cardIcon: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    background: "rgba(79,126,248,0.1)",
    border: "1px solid rgba(79,126,248,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: "#7aa4ff",
  },
  cardTitle: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 600,
    color: "#c8cce0",
  },
  cardDesc: {
    margin: "2px 0 0",
    fontSize: "11.5px",
    color: "#5a6080",
    lineHeight: 1.5,
  },
  footer: {
    margin: "24px 0 0",
    fontSize: "11px",
    color: "#3d435c",
    letterSpacing: "0.3px",
  },
};
