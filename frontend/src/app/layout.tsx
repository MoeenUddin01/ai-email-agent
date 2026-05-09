import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Email Agent — Intelligent Gmail Replies",
  description: "AI-powered email reply agent for Gmail with RAG from your knowledge base.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ minHeight: "100vh", background: "#0d0f14" }}>
        {children}
      </body>
    </html>
  );
}
