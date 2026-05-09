
from google_auth_oauthlib.flow import Flow
import os
from dotenv import load_dotenv

load_dotenv()

SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
]

client_config = {
    "web": {
        "client_id": os.getenv("GMAIL_CLIENT_ID"),
        "client_secret": os.getenv("GMAIL_CLIENT_SECRET"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [os.getenv("GMAIL_REDIRECT_URI")],
    }
}

flow = Flow.from_client_config(client_config, scopes=SCOPES)
flow.redirect_uri = os.getenv("GMAIL_REDIRECT_URI")
auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')

print(f"Auth URL: {auth_url}")
print(f"Code Verifier in flow: {getattr(flow, 'code_verifier', 'Not found')}")
