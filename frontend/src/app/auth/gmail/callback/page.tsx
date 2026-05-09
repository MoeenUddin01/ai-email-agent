"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/utils/supabase";

export default function GmailCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const handledRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      if (handledRef.current) return;
      handledRef.current = true;

      const code = searchParams.get("code");
      const error = searchParams.get("error");

      if (error) {
        setStatus("error");
        setMessage(`Gmail authorization failed: ${error}`);
        return;
      }

      if (!code) {
        setStatus("error");
        setMessage("No authorization code received");
        return;
      }

      try {
        // Get session token
        const sessionToken = (await supabase.auth.getSession()).data.session?.access_token;
        if (!sessionToken) {
          setStatus("error");
          setMessage("No authentication session found");
          return;
        }

        // Exchange code for tokens and store them
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/gmail/callback?code=${code}`,
          {
            headers: { Authorization: `Bearer ${sessionToken}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          
          // Store credentials
          const storeResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/gmail/store-credentials`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${sessionToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
              }),
            }
          );

          if (storeResponse.ok) {
            setStatus("success");
            setMessage("Gmail account connected successfully!");
            setTimeout(() => {
              router.push("/inbox");
            }, 2000);
          } else {
            setStatus("error");
            setMessage("Failed to store Gmail credentials");
          }
        } else {
          const errorData = await response.json();
          setStatus("error");
          setMessage(`Failed to connect Gmail: ${errorData.detail || 'Unknown error'}`);
        }
      } catch (error) {
        console.error("Gmail callback error:", error);
        setStatus("error");
        setMessage("An unexpected error occurred");
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full p-6 text-center">
        {status === "loading" && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-xl font-semibold mb-2">Connecting Gmail...</h1>
            <p className="text-gray-600">Please wait while we connect your Gmail account.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold mb-2 text-green-600">Success!</h1>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-400 mt-2">Redirecting to inbox...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold mb-2 text-red-600">Connection Failed</h1>
            <p className="text-gray-600">{message}</p>
            <button
              onClick={() => router.push("/inbox")}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Inbox
            </button>
          </>
        )}
      </div>
    </div>
  );
}
