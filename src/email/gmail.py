"""Gmail API service."""

import base64
from typing import List, Optional
from datetime import datetime
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from src.api.config import settings


class GmailService:
    """Gmail API integration service."""
    
    SCOPES = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
    ]
    
    def __init__(self, credentials: Optional[Credentials] = None):
        self.credentials = credentials
        self.service = None
        if credentials:
            self.service = build('gmail', 'v1', credentials=credentials)
    
    def get_auth_url(self) -> str:
        """Get Google OAuth authorization URL."""
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GMAIL_CLIENT_ID,
                    "client_secret": settings.GMAIL_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [settings.GMAIL_REDIRECT_URI],
                }
            },
            scopes=self.SCOPES,
        )
        flow.redirect_uri = settings.GMAIL_REDIRECT_URI
        auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
        return auth_url
    
    def exchange_code(self, code: str) -> Credentials:
        """Exchange authorization code for credentials."""
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.GMAIL_CLIENT_ID,
                    "client_secret": settings.GMAIL_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [settings.GMAIL_REDIRECT_URI],
                }
            },
            scopes=self.SCOPES,
        )
        flow.redirect_uri = settings.GMAIL_REDIRECT_URI
        flow.fetch_token(code=code)
        return flow.credentials
    
    async def fetch_emails(self, max_results: int = 50, query: str = "label:inbox") -> List[dict]:
        """Fetch emails from Gmail."""
        if not self.service:
            raise ValueError("Gmail service not authenticated")
        
        results = self.service.users().messages().list(
            userId='me',
            maxResults=max_results,
            q=query,
            labelIds=['INBOX']
        ).execute()
        
        messages = results.get('messages', [])
        emails = []
        
        for msg in messages:
            email_data = await self.get_email(msg['id'])
            if email_data:
                emails.append(email_data)
        
        return emails
    
    async def get_email(self, message_id: str) -> Optional[dict]:
        """Get a specific email by ID."""
        if not self.service:
            raise ValueError("Gmail service not authenticated")
        
        message = self.service.users().messages().get(
            userId='me',
            id=message_id,
            format='full'
        ).execute()
        
        headers = {h['name']: h['value'] for h in message['payload']['headers']}
        body = self._get_body(message['payload'])
        
        return {
            'gmail_id': message['id'],
            'thread_id': message['threadId'],
            'sender': headers.get('From', ''),
            'subject': headers.get('Subject', ''),
            'body_text': body,
            'received_at': datetime.fromtimestamp(int(message['internalDate']) / 1000).isoformat(),
            'snippet': message.get('snippet', ''),
        }
    
    def _get_body(self, payload: dict) -> str:
        """Extract text body from email payload."""
        body = ""
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain':
                    data = part['body'].get('data', '')
                    if data:
                        body = base64.urlsafe_b64decode(data).decode('utf-8')
                        break
                elif part['mimeType'] == 'multipart/alternative':
                    body = self._get_body(part)
                    if body:
                        break
        elif payload.get('mimeType') == 'text/plain':
            data = payload['body'].get('data', '')
            if data:
                body = base64.urlsafe_b64decode(data).decode('utf-8')
        
        return body
    
    async def send_reply(self, thread_id: str, to: str, subject: str, body: str, original_message_id: str) -> dict:
        """Send a reply to an email."""
        if not self.service:
            raise ValueError("Gmail service not authenticated")
        
        message = self._create_message(to, subject, body, thread_id)
        
        sent = self.service.users().messages().send(
            userId='me',
            body=message
        ).execute()
        
        return {
            'gmail_message_id': sent['id'],
            'thread_id': sent['threadId'],
        }
    
    def _create_message(self, to: str, subject: str, body: str, thread_id: str) -> dict:
        """Create a MIME message."""
        from email.mime.text import MIMEText
        import base64
        
        message = MIMEText(body)
        message['to'] = to
        message['subject'] = subject
        
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        return {
            'raw': raw,
            'threadId': thread_id,
        }
