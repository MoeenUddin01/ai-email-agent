
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

# Try to disable PKCE by not using the automatic generation if possible
# Or just use the lower level oauthlib
auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
print(f"Default Auth URL: {auth_url}")

# Can we pass something to disable it?
# Let's try passing code_challenge=None (though it might not be a valid arg)
try:
    auth_url2, _ = flow.authorization_url(prompt='consent', access_type='offline', code_challenge=None)
    print(f"Auth URL (code_challenge=None): {auth_url2}")
except Exception as e:
    print(f"Error with code_challenge=None: {e}")

# What if we use oauthlib directly?
from oauthlib.oauth2 import WebApplicationClient
client = WebApplicationClient(os.getenv("GMAIL_CLIENT_ID"))
auth_url3 = client.prepare_request_uri(
    "https://accounts.google.com/o/oauth2/auth",
    redirect_uri=os.getenv("GMAIL_REDIRECT_URI"),
    scope=SCOPES,
    prompt='consent',
    access_type='offline'
)
print(f"Manual Auth URL: {auth_url3}")
