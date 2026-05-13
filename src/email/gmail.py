"""Gmail API service with non-blocking async support."""

import base64
import asyncio
from typing import List, Optional
from datetime import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from src.api.config import settings


class GmailService:
    """Gmail API integration service."""

    SCOPES = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
    ]

    AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
    TOKEN_URI = "https://oauth2.googleapis.com/token"

    def __init__(self, credentials: Optional[Credentials] = None):
        self.credentials = credentials
        self.service = None
        if credentials:
            self.service = build('gmail', 'v1', credentials=credentials)

    def get_auth_url(self) -> str:
        """Get Google OAuth authorization URL."""
        from urllib.parse import urlencode
        params = {
            "client_id": settings.GMAIL_CLIENT_ID,
            "redirect_uri": settings.GMAIL_REDIRECT_URI,
            "response_type": "code",
            "scope": " ".join(self.SCOPES),
            "access_type": "offline",
            "prompt": "consent",
        }
        return f"{self.AUTH_URI}?{urlencode(params)}"

    def exchange_code(self, code: str) -> Credentials:
        """Exchange authorization code for credentials."""
        import requests as sync_requests
        response = sync_requests.post(
            self.TOKEN_URI,
            data={
                "code": code,
                "client_id": settings.GMAIL_CLIENT_ID,
                "client_secret": settings.GMAIL_CLIENT_SECRET,
                "redirect_uri": settings.GMAIL_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        response.raise_for_status()
        token_data = response.json()

        return Credentials(
            token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token"),
            token_uri=self.TOKEN_URI,
            client_id=settings.GMAIL_CLIENT_ID,
            client_secret=settings.GMAIL_CLIENT_SECRET,
            scopes=self.SCOPES,
        )

    async def _run_blocking(self, func, *args, **kwargs):
        """Run a blocking Google API call in a thread pool."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: func(*args, **kwargs))

    async def fetch_emails(self, max_results: int = 50, query: str = "label:inbox") -> List[dict]:
        """Fetch emails from Gmail (non-blocking)."""
        if not self.service:
            raise ValueError("Gmail service not authenticated")

        results = await self._run_blocking(
            self.service.users().messages().list(
                userId='me',
                maxResults=max_results,
                q=query,
                labelIds=['INBOX']
            ).execute
        )

        messages = results.get('messages', [])
        emails = []

        for msg in messages:
            email_data = await self.get_email(msg['id'])
            if email_data:
                emails.append(email_data)

        return emails

    async def get_email(self, message_id: str) -> Optional[dict]:
        """Get a specific email by ID (non-blocking)."""
        if not self.service:
            raise ValueError("Gmail service not authenticated")

        message = await self._run_blocking(
            self.service.users().messages().get(
                userId='me',
                id=message_id,
                format='full'
            ).execute
        )

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
        """Send a reply to an email (non-blocking)."""
        if not self.service:
            raise ValueError("Gmail service not authenticated")

        message = self._create_message(to, subject, body, thread_id)

        sent = await self._run_blocking(
            self.service.users().messages().send(
                userId='me',
                body=message
            ).execute
        )

        return {
            'gmail_message_id': sent['id'],
            'thread_id': sent['threadId'],
        }

    def _create_message(self, to: str, subject: str, body: str, thread_id: str) -> dict:
        """Create a MIME message."""
        from email.mime.text import MIMEText

        message = MIMEText(body)
        message['to'] = to
        message['subject'] = subject

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')

        return {
            'raw': raw,
            'threadId': thread_id,
        }
