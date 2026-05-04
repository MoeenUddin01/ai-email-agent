"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      console.log('Handling auth callback...');
      console.log('Current URL:', window.location.href);
      console.log('URL params:', window.location.search);
      
      // Let Supabase handle the OAuth session automatically
      // The session should be established when the page loads
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Error getting session:', error);
        router.push("/");
        return;
      }

      console.log('Session data:', data);

      if (data.session) {
        console.log('Session found, redirecting to inbox');
        router.push("/inbox");
      } else {
        console.log('No session found, waiting for OAuth to complete...');
        // Wait a bit and check again
        setTimeout(async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            console.log('Session established after delay, redirecting to inbox');
            router.push("/inbox");
          } else {
            console.log('Still no session, redirecting to home');
            router.push("/");
          }
        }, 3000);
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    </div>
  );
}
