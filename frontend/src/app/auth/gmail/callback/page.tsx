"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function GmailCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const statusParam = searchParams.get("status");
    const detailParam = searchParams.get("detail");

    if (statusParam === "success") {
      setStatus("success");
      setMessage("Gmail account connected successfully!");
      setTimeout(() => {
        router.push("/inbox");
      }, 2000);
    } else {
      setStatus("error");
      setMessage(detailParam || "Failed to connect Gmail");
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full p-6 text-center">
        {status === "loading" && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-xl font-semibold mb-2">Completing Gmail Connection...</h1>
            <p className="text-gray-600">Please wait while we finalize the setup.</p>
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

export default function GmailCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <GmailCallbackInner />
    </Suspense>
  );
}
