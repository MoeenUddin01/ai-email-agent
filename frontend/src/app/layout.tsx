import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

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
    <html lang="en" className={inter.variable}>
      <head>
        <script src="https://accounts.google.com/gsi/client" async defer />
      </head>
      <body style={{ minHeight: "100vh", background: "#0d0f14" }}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
