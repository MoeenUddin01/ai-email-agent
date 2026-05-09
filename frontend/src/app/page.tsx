"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";
import { User } from "@supabase/supabase-js";

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
      <div style={styles.fullCenter}>
        <div style={styles.spinner} />
      </div>
    );
  }

  const features = [
    { icon: "✉️", label: "Gmail Integration", desc: "Sync your Primary inbox in one click" },
    { icon: "🤖", label: "AI-Powered Replies", desc: "Groq/Gemini generates smart drafts" },
    { icon: "📚", label: "RAG Knowledge Base", desc: "Answers grounded in your data" },
    { icon: "✏️", label: "Edit Before Sending", desc: "You always have the final say" },
    { icon: "⭐", label: "Feedback Loop", desc: "Rate replies to improve quality" },
  ];

  return (
    <main style={styles.page}>
      {/* Background glow */}
      <div style={styles.bgGlow} />

      <div style={styles.container}>
        {/* Logo mark */}
        <div style={styles.logoWrap}>
          <span style={styles.logoIcon}>⚡</span>
        </div>

        {/* Heading */}
        <h1 style={styles.heading}>AI Email Agent</h1>
        <p style={styles.subheading}>
          Intelligent Gmail replies powered by AI&nbsp;&amp;&nbsp;your knowledge base
        </p>

        {/* Feature grid */}
        <div style={styles.featureGrid}>
          {features.map((f) => (
            <div key={f.label} style={styles.featureCard}>
              <span style={styles.featureIcon}>{f.icon}</span>
              <div>
                <p style={styles.featureTitle}>{f.label}</p>
                <p style={styles.featureDesc}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          id="google-signin-btn"
          onClick={handleLogin}
          disabled={isSigningIn}
          style={{
            ...styles.signInBtn,
            opacity: isSigningIn ? 0.7 : 1,
            cursor: isSigningIn ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => { if (!isSigningIn) (e.currentTarget as HTMLButtonElement).style.background = "#5d8aff"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#4f7ef8"; }}
        >
          {isSigningIn ? (
            <>
              <div style={styles.spinner} />
              Signing in…
            </>
          ) : (
            <>
              <GoogleIcon />
              Sign in with Google
            </>
          )}
        </button>

        <p style={styles.privacyNote}>
          🔒 We never auto-send emails — your approval is always required.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0d0f14",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
  },
  bgGlow: {
    position: "absolute",
    top: "10%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "600px",
    height: "400px",
    background: "radial-gradient(ellipse, rgba(79,126,248,0.12) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  container: {
    maxWidth: "460px",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    position: "relative",
    zIndex: 1,
  },
  logoWrap: {
    width: "56px",
    height: "56px",
    background: "rgba(79,126,248,0.15)",
    border: "1px solid rgba(79,126,248,0.3)",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "26px",
    marginBottom: "4px",
  },
  logoIcon: { lineHeight: 1 },
  heading: {
    margin: 0,
    fontSize: "32px",
    fontWeight: 700,
    color: "#e8eaf0",
    letterSpacing: "-0.5px",
  },
  subheading: {
    margin: 0,
    fontSize: "14px",
    color: "#8b91a8",
    textAlign: "center",
    lineHeight: 1.6,
  },
  featureGrid: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "8px",
  },
  featureCard: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "12px 16px",
    background: "#181c26",
    border: "1px solid #232840",
    borderRadius: "10px",
    transition: "border-color 0.2s",
  },
  featureIcon: { fontSize: "20px", flexShrink: 0 },
  featureTitle: { margin: 0, fontSize: "13px", fontWeight: 600, color: "#d0d4e4" },
  featureDesc: { margin: 0, fontSize: "12px", color: "#6b7191", marginTop: "1px" },
  signInBtn: {
    marginTop: "8px",
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
    transition: "background 0.2s",
    fontFamily: "inherit",
  },
  privacyNote: {
    margin: 0,
    fontSize: "12px",
    color: "#555d78",
    textAlign: "center",
  },
  fullCenter: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0d0f14",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid rgba(255,255,255,0.2)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};
