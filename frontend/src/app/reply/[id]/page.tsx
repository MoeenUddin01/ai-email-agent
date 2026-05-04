"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Send, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabase";

interface Draft {
  id: string;
  draft_content: string;
  model_used: string;
  retrieved_context: {
    documents: Array<{
      content: string;
      similarity: number;
    }>;
  };
}

export default function ReplyPage() {
  const router = useRouter();
  const params = useParams();
  const emailId = params.id as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    generateDraft();
  }, [emailId]);

  const generateDraft = async () => {
    setGenerating(true);
    try {
      const sessionToken = (await supabase.auth.getSession()).data.session?.access_token;
      if (!sessionToken) {
        console.error("No authentication token found");
        router.push("/");
        return;
      }
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/emails/${emailId}/process`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        }
      );

      if (response.ok) {
        // Fetch the generated draft
        const draftResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/drafts/${emailId}`,
          {
            headers: { Authorization: `Bearer ${sessionToken}` },
          }
        );

        if (draftResponse.ok) {
          const draftData = await draftResponse.json();
          setDraft(draftData);
          setEditedContent(draftData.draft_content);
        }
      }
    } catch (error) {
      console.error("Failed to generate draft:", error);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draft) return;

    setSending(true);
    try {
      const sessionToken = (await supabase.auth.getSession()).data.session?.access_token;
      if (!sessionToken) {
        console.error("No authentication token found");
        return;
      }
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/drafts/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            draft_id: draft.id,
            email_id: emailId,
            final_content: editedContent,
          }),
        }
      );

      if (response.ok) {
        const sentData = await response.json();
        setShowRating(true);
      }
    } catch (error) {
      console.error("Failed to send email:", error);
    } finally {
      setSending(false);
    }
  };

  const submitFeedback = async () => {
    try {
      const sessionToken = (await supabase.auth.getSession()).data.session?.access_token;
      // TODO: Get sent_email_id from response
      router.push("/inbox");
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    }
  };

  if (loading || generating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">
            {generating ? "AI is crafting your reply..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-4">
        <button
          onClick={() => router.push("/inbox")}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold">Review & Send Reply</h1>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {draft && (
          <div className="space-y-6">
            {/* AI Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-800 mb-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-medium">AI-Generated Draft</span>
              </div>
              <p className="text-sm text-blue-700">
                Model: {draft.model_used}
              </p>
              {draft.retrieved_context?.documents && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-blue-800 mb-1">
                    Referenced {draft.retrieved_context.documents.length} documents
                  </p>
                </div>
              )}
            </div>

            {/* Editor */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="border-b px-4 py-2 bg-gray-50 rounded-t-lg">
                <span className="text-sm font-medium text-gray-600">
                  Edit your reply before sending
                </span>
              </div>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full h-96 p-4 resize-none focus:outline-none"
                placeholder="Your reply..."
              />
            </div>

            {/* Actions */}
            {!showRating ? (
              <div className="flex gap-3">
                <button
                  onClick={handleSend}
                  disabled={sending || !editedContent.trim()}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Approve & Send
                    </>
                  )}
                </button>
                <button
                  onClick={generateDraft}
                  disabled={generating}
                  className="px-6 py-3 border rounded-lg hover:bg-gray-50"
                >
                  Regenerate
                </button>
              </div>
            ) : (
              /* Feedback Form */
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-semibold mb-4">
                  How was this reply?
                </h3>

                {/* Star Rating */}
                <div className="flex gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`text-2xl ${
                        star <= rating ? "text-yellow-400" : "text-gray-300"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                {/* Text Feedback */}
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Optional feedback about the reply quality..."
                  className="w-full h-24 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                />

                <button
                  onClick={submitFeedback}
                  disabled={rating === 0}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Submit Feedback
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
