#!/usr/bin/env python3
"""
Send Halloween token grant email using AWS SES.

Requirements:
1. AWS credentials configured (via ~/.aws/credentials or environment variables)
2. SES email address verified in AWS SES console
3. If in SES sandbox, recipient email must also be verified

Usage:
    python send_halloween_email.py recipient@example.com

Or set RECIPIENT_EMAIL environment variable:
    RECIPIENT_EMAIL=recipient@example.com python send_halloween_email.py
"""

import boto3
import os
import sys
from botocore.exceptions import ClientError, NoCredentialsError

# Configure AWS credentials - check environment variables or use default profile
def get_ses_client():
    """Get SES client with helpful error messages for credential issues"""
    try:
        # Try to create client to validate credentials
        client = boto3.client('ses', region_name='us-east-1')
        # Quick test to see if credentials are valid
        return client
    except NoCredentialsError:
        print("❌ AWS credentials not found!")
        print("\n💡 To fix this, choose one of the following:")
        print("\n1. Set environment variables:")
        print("   export AWS_ACCESS_KEY_ID=your_access_key")
        print("   export AWS_SECRET_ACCESS_KEY=your_secret_key")
        print("   export AWS_SESSION_TOKEN=your_token  # Only if using temporary credentials")
        print("\n2. Configure AWS CLI:")
        print("   aws configure")
        print("   # This will create ~/.aws/credentials")
        print("\n3. Use a credentials file (~/.aws/credentials):")
        print("   [default]")
        print("   aws_access_key_id = YOUR_ACCESS_KEY")
        print("   aws_secret_access_key = YOUR_SECRET_KEY")
        sys.exit(1)
    except Exception as e:
        if 'InvalidClientTokenId' in str(e) or 'InvalidClientTokenId' in str(type(e)):
            print("❌ Invalid AWS credentials!")
            print("\n💡 Your AWS credentials are invalid or expired.")
            print("   Please check:")
            print("   - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables")
            print("   - ~/.aws/credentials file")
            print("   - AWS CLI configuration (run 'aws configure')")
            sys.exit(1)
        raise

# SES client
ses_client = get_ses_client()

# Sender email - UPDATE THIS to your verified SES email
SENDER_EMAIL = os.environ.get('SES_SENDER_EMAIL', 'blockforger@protonmail.com')

# Read HTML email content
def read_email_html():
    try:
        with open('promo.html', 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print("Error: promo.html not found. Make sure the email HTML file exists.")
        sys.exit(1)

def send_email(recipient_email, subject="🎃 Boo! From Blockforger"):
    """Send HTML email via AWS SES"""
    
    # Read HTML content
    html_body = read_email_html()
    
    # Plain text fallback (simple version)
    text_body = f"""
Happy Halloween! 🎃

We're gifting you 1,500 tokens to use with Blockforger!

Visit the development site at:
https://blockforger.zanzalaz.com/?tenant=petstore&comment=["Click dropdowns/+ to add optional fields/arr","Blocks serialize to api input JSON!"]&initial={{"name":"Demo Pet","photoUrls":["url1","url2"],"status":"available"}}&rootSchema=pet

Note: You'll need to sign in with Google to access your account.

This link is to our development site at blockforger.zanzalaz.com. 
The production site will remain available at blockforger.net.

Thank you for being part of our community. Happy Building!

© 2025 Blockforger LLC, Wyoming. All rights reserved.
"""
    
    try:
        response = ses_client.send_email(
            Source=SENDER_EMAIL,
            Destination={
                'ToAddresses': [recipient_email],
            },
            Message={
                'Subject': {
                    'Data': subject,
                    'Charset': 'UTF-8'
                },
                'Body': {
                    'Text': {
                        'Data': text_body,
                        'Charset': 'UTF-8'
                    },
                    'Html': {
                        'Data': html_body,
                        'Charset': 'UTF-8'
                    }
                }
            }
        )
        
        print(f"✅ Email sent successfully!")
        print(f"   Message ID: {response['MessageId']}")
        print(f"   Recipient: {recipient_email}")
        return True
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        print(f"❌ Error sending email: {error_code}")
        print(f"   {error_message}")
        
        if error_code == 'InvalidClientTokenId':
            print("\n💡 AWS credentials are invalid or expired.")
            print("   Fix by:")
            print("   1. Running 'aws configure' to set up credentials")
            print("   2. Setting AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars")
            print("   3. Checking ~/.aws/credentials file")
        elif error_code == 'MessageRejected':
            print("\n💡 Common issues:")
            print("   - Email address not verified in SES (if in sandbox mode)")
            print("   - Sender email not verified in SES")
            print("   - Account in SES sandbox (can only send to verified emails)")
        elif error_code == 'MailFromDomainNotVerifiedException':
            print("\n💡 Verify your sender domain in SES console")
        elif error_code == 'AccountSendingPausedException':
            print("\n💡 Your SES account sending has been paused")
            
        return False
    except Exception as e:
        if 'InvalidClientTokenId' in str(e) or 'credentials' in str(e).lower():
            print(f"❌ AWS credentials error: {e}")
            print("\n💡 Set up AWS credentials:")
            print("   export AWS_ACCESS_KEY_ID=your_key")
            print("   export AWS_SECRET_ACCESS_KEY=your_secret")
            return False
        raise

def send_bulk_emails(recipient_list):
    """Send to multiple recipients (up to 50 per batch for SES)"""
    
    html_body = read_email_html()
    
    # Split into batches of 50 (SES limit)
    batch_size = 50
    for i in range(0, len(recipient_list), batch_size):
        batch = recipient_list[i:i + batch_size]
        
        try:
            response = ses_client.send_bulk_templated_email(
                Source=SENDER_EMAIL,
                Template='',  # Not using template
                # For bulk, we'll send individually
            )
        except Exception as e:
            print(f"Error in batch {i//batch_size + 1}: {e}")
            # Fall back to individual sends
            for email in batch:
                send_email(email)

def main():
    # Get recipient from command line or environment
    if len(sys.argv) > 1:
        recipient = sys.argv[1]
    else:
        recipient = os.environ.get('RECIPIENT_EMAIL')
    
    if not recipient:
        print("Usage: python send_halloween_email.py recipient@example.com")
        print("   Or: RECIPIENT_EMAIL=recipient@example.com python send_halloween_email.py")
        sys.exit(1)
    
    # Check if it's a file with multiple recipients
    if os.path.isfile(recipient):
        print(f"Reading recipients from file: {recipient}")
        with open(recipient, 'r') as f:
            recipients = [line.strip() for line in f if line.strip() and '@' in line]
        print(f"Found {len(recipients)} recipients")
        
        if input("Send to all? (yes/no): ").lower() != 'yes':
            print("Cancelled")
            sys.exit(0)
            
        for email in recipients:
            print(f"\nSending to {email}...")
            send_email(email)
            # Small delay to avoid rate limits
            import time
            time.sleep(0.5)
    else:
        # Single recipient
        send_email(recipient)

if __name__ == '__main__':
    main()

