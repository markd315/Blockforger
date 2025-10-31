# Sending Halloween Token Email

## Quick Options

### Option 1: AWS SES (Recommended - Already Using AWS)

**Setup:**
1. **Configure AWS credentials:**
   ```bash
   # Option A: Use AWS CLI (recommended)
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, and region (us-east-1)
   
   # Option B: Set environment variables
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_DEFAULT_REGION=us-east-1
   ```

2. **Verify your sender email in AWS SES Console:**
   - Go to: https://console.aws.amazon.com/ses/ (us-east-1 region)
   - Click "Verified identities" → "Create identity"
   - Verify the email you want to send from (check your inbox for verification link)

3. **Update sender email:**
   ```bash
   # Set environment variable
   export SES_SENDER_EMAIL=your-verified-email@example.com
   
   # Or edit send_promo.py line 26
   ```

4. **Run:**
   ```bash
   python marketing/send_promo.py recipient@example.com
   ```

**For bulk sending:**
1. Create a file `recipients.txt` with one email per line
2. Run: `python send_halloween_email.py recipients.txt`

**Note:** If your SES account is in sandbox mode, you can only send to verified email addresses. Request production access in SES console to send to any email.

---

### Option 2: Use a Web-Based Service

#### SendGrid (Free tier: 100 emails/day)
1. Sign up at sendgrid.com
2. Get API key
3. Use this script:
```python
import sendgrid
from sendgrid.helpers.mail import Mail

sg = sendgrid.SendGridAPIClient(api_key='YOUR_API_KEY')
with open('promo.html', 'r') as f:
    html_content = f.read()

message = Mail(
    from_email='noreply@blockforger.net',
    to_emails='recipient@example.com',
    subject='🎃 Happy Halloween! 1,500 Tokens Gift from Blockforger',
    html_content=html_content
)
sg.send(message)
```

#### Mailgun (Free tier: 100 emails/day for 3 months)
```python
import requests

with open('promo.html', 'r') as f:
    html_content = f.read()

response = requests.post(
    "https://api.mailgun.net/v3/YOUR_DOMAIN/messages",
    auth=("api", "YOUR_API_KEY"),
    data={
        "from": "Blockforger <noreply@blockforger.net>",
        "to": ["recipient@example.com"],
        "subject": "🎃 Happy Halloween! 1,500 Tokens Gift from Blockforger",
        "html": html_content
    }
)
```

---

### Option 3: Use Gmail SMTP (Simple, but limited)

1. Enable "App Passwords" in Google Account settings
2. Use this script:

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Your Gmail credentials
GMAIL_USER = 'your-email@gmail.com'
GMAIL_PASSWORD = 'your-app-password'  # App password, not regular password

with open('promo.html', 'r') as f:
    html_content = f.read()

msg = MIMEMultipart('alternative')
msg['Subject'] = '🎃 Happy Halloween! 1,500 Tokens Gift from Blockforger'
msg['From'] = GMAIL_USER
msg['To'] = 'recipient@example.com'

html_part = MIMEText(html_content, 'html')
msg.attach(html_part)

with smtplib.SMTP('smtp.gmail.com', 587) as server:
    server.starttls()
    server.login(GMAIL_USER, GMAIL_PASSWORD)
    server.send_message(msg)
```

---

### Option 4: Create Lambda Function (For Production)

Add this to your Lambda function to send emails programmatically:

```python
import boto3

ses = boto3.client('ses', region_name='us-east-1')

def send_halloween_email(recipient_email, token_amount=1500):
    with open('/var/task/promo.html', 'r') as f:
        html_body = f.read()
    
    ses.send_email(
        Source='noreply@blockforger.net',
        Destination={'ToAddresses': [recipient_email]},
        Message={
            'Subject': {'Data': '🎃 Happy Halloween! Token Gift from Blockforger'},
            'Body': {'Html': {'Data': html_body}}
        }
    )
```

---

## Recommendation

Since you're already using AWS, **AWS SES is the best option**. It's:
- Already integrated with your infrastructure
- Very cheap ($0.10 per 1,000 emails)
- Scales automatically
- No daily limits once out of sandbox

Just verify your sender email in SES console and you're ready to go!

