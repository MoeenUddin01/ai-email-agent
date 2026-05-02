// TypeScript types for AI Email Agent

export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface Email {
  id: string;
  gmail_id: string;
  thread_id: string;
  sender: string;
  subject: string;
  body_text: string;
  received_at: string;
  status: 'unread' | 'processed' | 'replied';
}

export interface AIDraft {
  id: string;
  email_id: string;
  draft_content: string;
  model_used: string;
  retrieved_context: {
    documents: Array<{
      id: string;
      content: string;
      metadata: Record<string, string>;
      similarity: number;
    }>;
    context_text: string;
  };
  created_at: string;
}

export interface SentEmail {
  id: string;
  email_id: string;
  ai_draft_id: string;
  final_content: string;
  was_modified: boolean;
  sent_at: string;
  gmail_message_id: string;
}

export interface Feedback {
  id: string;
  sent_email_id: string;
  star_rating: number;
  text_feedback?: string;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  content: string;
  metadata: Record<string, string>;
  created_at: string;
}
