declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface CodeClientConfig {
        client_id: string;
        scope: string;
        callback: (response: CodeResponse) => void;
        error_callback?: (error: any) => void;
        ux_mode?: "popup" | "redirect";
        redirect_uri?: string;
      }

      interface CodeResponse {
        code?: string;
        scope?: string;
        error?: string;
        error_description?: string;
        error_uri?: string;
      }

      interface CodeClient {
        requestCode: () => void;
      }

      function initCodeClient(config: CodeClientConfig): CodeClient;
    }
  }
}
