"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Star, Send, RefreshCw, LogOut } from "lucide-react";
import { supabase } from "@/utils/supabase";

interface Email {
  id: string;
  gmail_id: string;
  sender: string;
  subject: string;
  body_text: string;
  received_at: string;
  status: string;
}

export default function Inbox() {
  const router = useRouter();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/");
        return;
      }
      fetchEmails();
    };
    
    checkAuth();
  }, [router]);

  const fetchEmails = async () => {
    try {
      const sessionToken = (await supabase.auth.getSession()).data.session?.access_token;
      if (!sessionToken) return;
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/emails/`,
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setEmails(data.emails);
      }
    } catch (error) {
      console.error("Failed to fetch emails:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-semibold">AI Email Agent</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEmails}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Sync emails"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Email List */}
        <div className="w-1/3 bg-white border-r overflow-y-auto">
          {emails.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No emails yet</p>
              <button
                onClick={fetchEmails}
                className="mt-4 text-blue-600 hover:underline"
              >
                Sync from Gmail
              </button>
            </div>
          ) : (
            emails.map((email) => (
              <div
                key={email.id}
                onClick={() => setSelectedEmail(email)}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  selectedEmail?.id === email.id ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {email.sender}
                    </p>
                    <p className="text-sm text-gray-600 truncate">
                      {email.subject}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(email.received_at).toLocaleDateString()}
                    </p>
                  </div>
                  {email.status === "replied" && (
                    <Send className="w-4 h-4 text-green-500 ml-2" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Email Detail */}
        <div className="flex-1 bg-white overflow-y-auto">
          {selectedEmail ? (
            <div className="p-6">
              <div className="border-b pb-4 mb-4">
                <h2 className="text-xl font-semibold mb-2">
                  {selectedEmail.subject}
                </h2>
                <p className="text-gray-600">From: {selectedEmail.sender}</p>
                <p className="text-sm text-gray-400">
                  {new Date(selectedEmail.received_at).toLocaleString()}
                </p>
              </div>

              <div className="prose max-w-none mb-6">
                <p className="whitespace-pre-wrap">{selectedEmail.body_text}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    router.push(`/reply/${selectedEmail.id}`);
                  }}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  <Send className="w-4 h-4" />
                  Generate Reply
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <p>Select an email to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
