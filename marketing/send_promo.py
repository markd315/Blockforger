#!/usr/bin/env python3
"""
Send Halloween token grant email using AWS SES, or trigger Lambda for token grants.

Requirements:
1. AWS credentials configured (via ~/.aws/credentials or environment variables)
2. SES email address verified in AWS SES console (for email mode)
3. If in SES sandbox, recipient email must also be verified (for email mode)

Usage:
    # Send email:
    python send_promo.py recipient@example.com
    
    # Trigger Lambda for token grant:
    python send_promo.py --lambda recipient@example.com
    
    # Process recipients file:
    python send_promo.py recipients.txt
    python send_promo.py --lambda recipients.txt

Or set RECIPIENT_EMAIL environment variable:
    RECIPIENT_EMAIL=recipient@example.com python send_promo.py
"""

import boto3
import os
import sys
import json
import argparse
import uuid
from datetime import datetime
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

# SES client (for email mode)
ses_client = get_ses_client()

# Lambda client (for lambda mode)
def get_lambda_client():
    """Get Lambda client with helpful error messages for credential issues"""
    try:
        client = boto3.client('lambda', region_name='us-east-1')
        return client
    except NoCredentialsError:
        print("❌ AWS credentials not found!")
        sys.exit(1)
    except Exception as e:
        if 'InvalidClientTokenId' in str(e) or 'InvalidClientTokenId' in str(type(e)):
            print("❌ Invalid AWS credentials!")
            sys.exit(1)
        raise

lambda_client = get_lambda_client()

# Lambda function name (defaults to dev environment)
LAMBDA_FUNCTION_NAME = os.environ.get('STRIPE_WEBHOOK_LAMBDA_NAME', 'stripe-webhook-processor-dev')

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

def create_sqs_event_for_email(email):
    """Create SQS-wrapped Stripe checkout.session.completed event with email replaced"""
    
    # Base event structure from the provided template
    event = {
        "Records": [
            {
                "messageId": str(uuid.uuid4()),
                "receiptHandle": "AQEBwJnKyrHigUMZj6rY4CgszG0MDbjZrW3usNCjS94SNAsAERK8G2tmEGnmyyYm9w3y/t5vn2g5yu7g8iu2XnYkbqB/+v9WxhMDuUeW2wzzlHPK9mVvH0Idz06C8kpmmXPCMsObse",
                "body": json.dumps({
                    "version": "0",
                    "id": str(uuid.uuid4()),
                    "detail-type": "checkout.session.completed",
                    "source": "aws.partner/stripe.com/ed_test_61TTWBLDLBl1c14x516TTKeNBlSQg1FcYBVxZwQS89Ci",
                    "account": "720291373173",
                    "time": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "region": "us-east-1",
                    "resources": [
                        "arn:aws:events:us-east-1::event-source/aws.partner/stripe.com/ed_61PgtRTG5aTCIz98516PLsRGLISQK0Otk6FWKjBrcDia"
                    ],
                    "detail": {
                        "id": f"evt_{str(uuid.uuid4()).replace('-', '')[:24]}",
                        "object": "event",
                        "api_version": "2025-09-30.clover",
                        "created": int(datetime.utcnow().timestamp()),
                        "data": {
                            "object": {
                                "id": f"cs_test_{str(uuid.uuid4()).replace('-', '')[:24]}",
                                "object": "checkout.session",
                                "adaptive_pricing": {"enabled": True},
                                "after_expiration": None,
                                "allow_promotion_codes": True,
                                "amount_subtotal": 5,
                                "amount_total": 5,
                                "automatic_tax": {
                                    "enabled": False,
                                    "liability": None,
                                    "provider": None,
                                    "status": None
                                },
                                "billing_address_collection": "auto",
                                "cancel_url": "https://stripe.com",
                                "client_reference_id": None,
                                "client_secret": None,
                                "collected_information": {
                                    "business_name": None,
                                    "individual_name": None,
                                    "shipping_details": None
                                },
                                "consent": None,
                                "consent_collection": {
                                    "payment_method_reuse_agreement": None,
                                    "promotions": "none",
                                    "terms_of_service": "none"
                                },
                                "created": int(datetime.utcnow().timestamp()),
                                "currency": "usd",
                                "currency_conversion": None,
                                "custom_fields": [],
                                "custom_text": {
                                    "after_submit": None,
                                    "shipping_address": None,
                                    "submit": None,
                                    "terms_of_service_acceptance": None
                                },
                                "customer": f"cus_{str(uuid.uuid4()).replace('-', '')[:16].upper()}",
                                "customer_creation": "always",
                                "customer_details": {
                                    "address": {
                                        "city": None,
                                        "country": "US",
                                        "line1": None,
                                        "line2": None,
                                        "postal_code": "11385",
                                        "state": None
                                    },
                                    "business_name": None,
                                    "email": email,  # REPLACED EMAIL HERE
                                    "individual_name": None,
                                    "name": "NEW USER",
                                    "phone": None,
                                    "tax_exempt": "none",
                                    "tax_ids": []
                                },
                                "customer_email": None,
                                "discounts": [],
                                "expires_at": int(datetime.utcnow().timestamp()) + 86400,
                                "invoice": None,
                                "invoice_creation": {
                                    "enabled": False,
                                    "invoice_data": {
                                        "account_tax_ids": None,
                                        "custom_fields": None,
                                        "description": None,
                                        "footer": None,
                                        "issuer": None,
                                        "metadata": {},
                                        "rendering_options": None
                                    }
                                },
                                "livemode": False,
                                "locale": "auto",
                                "metadata": {},
                                "mode": "payment",
                                "origin_context": None,
                                "payment_intent": f"pi_{str(uuid.uuid4()).replace('-', '')[:24]}",
                                "payment_link": f"plink_{str(uuid.uuid4()).replace('-', '')[:16]}",
                                "payment_method_collection": "if_required",
                                "payment_method_configuration_details": {
                                    "id": f"pmc_{str(uuid.uuid4()).replace('-', '')[:16]}",
                                    "parent": None
                                },
                                "payment_method_options": {},
                                "payment_method_types": ["card", "link", "cashapp", "amazon_pay"],
                                "payment_status": "paid",
                                "permissions": None,
                                "phone_number_collection": {"enabled": False},
                                "recovered_from": None,
                                "saved_payment_method_options": {
                                    "allow_redisplay_filters": ["always"],
                                    "payment_method_remove": "disabled",
                                    "payment_method_save": None
                                },
                                "setup_intent": None,
                                "shipping_address_collection": None,
                                "shipping_cost": None,
                                "shipping_options": [],
                                "status": "complete",
                                "submit_type": "auto",
                                "subscription": None,
                                "success_url": "https://blockforger.zanzalaz.com/stripe.html",
                                "total_details": {
                                    "amount_discount": 0,
                                    "amount_shipping": 0,
                                    "amount_tax": 0
                                },
                                "ui_mode": "hosted",
                                "url": None,
                                "wallet_options": None
                            },
                            "livemode": False,
                            "pending_webhooks": 0,
                            "request": {
                                "id": None,
                                "idempotency_key": None
                            },
                            "type": "checkout.session.completed"
                        }
                    }
                }),
                "attributes": {
                    "ApproximateReceiveCount": "1",
                    "SentTimestamp": str(int(datetime.utcnow().timestamp() * 1000)),
                    "SenderId": "AIDAIENQZJOLOOTTELNQ2",
                    "ApproximateFirstReceiveTimestamp": str(int(datetime.utcnow().timestamp() * 1000) + 2)
                },
                "messageAttributes": {},
                "md5OfBody": "7b270e59b47ff90a553787216d55d91d",
                "eventSource": "aws:sqs",
                "eventSourceARN": "arn:aws:sqs:us-east-1:720291373173:stripe-webhook-queue-dev",
                "awsRegion": "us-east-1"
            }
        ]
    }
    
    return event

def invoke_lambda_for_email(email):
    """Invoke Lambda function with SQS event format for token grant"""
    try:
        # Create the SQS event with email replaced
        event = create_sqs_event_for_email(email)
        
        # Invoke Lambda function
        response = lambda_client.invoke(
            FunctionName=LAMBDA_FUNCTION_NAME,
            InvocationType='RequestResponse',
            Payload=json.dumps(event)
        )
        
        # Parse response
        response_payload = json.loads(response['Payload'].read())
        
        if response['StatusCode'] == 200:
            print(f"✅ Lambda invoked successfully!")
            print(f"   Email: {email}")
            print(f"   Status: {response.get('StatusCode')}")
            if 'FunctionError' in response:
                print(f"   ⚠️ Function Error: {response.get('FunctionError')}")
                if 'errorMessage' in response_payload:
                    print(f"   Error: {response_payload.get('errorMessage')}")
            return True
        else:
            print(f"❌ Lambda invocation failed!")
            print(f"   Status Code: {response['StatusCode']}")
            print(f"   Response: {response_payload}")
            return False
            
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        print(f"❌ Error invoking Lambda: {error_code}")
        print(f"   {error_message}")
        
        if error_code == 'ResourceNotFoundException':
            print(f"\n💡 Lambda function '{LAMBDA_FUNCTION_NAME}' not found.")
            print(f"   Set STRIPE_WEBHOOK_LAMBDA_NAME environment variable or update the default.")
        elif error_code == 'InvalidParameterValueException':
            print(f"\n💡 Invalid Lambda function name or parameters.")
        
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

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
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Send promo email or trigger Lambda for token grants')
    parser.add_argument('recipient', nargs='?', help='Recipient email address or file with recipients')
    parser.add_argument('--lambda', action='store_true', help='Invoke Lambda instead of sending email')
    parser.add_argument('--yes', action='store_true', help='Skip confirmation prompt for bulk sends')
    
    args = parser.parse_args()
    
    # Get recipient from command line or environment
    recipient = args.recipient or os.environ.get('RECIPIENT_EMAIL')
    
    if not recipient:
        parser.print_help()
        print("\nAlternatively, set RECIPIENT_EMAIL environment variable")
        sys.exit(1)
    
    # Check if it's a file with multiple recipients
    if os.path.isfile(recipient):
        print(f"Reading recipients from file: {recipient}")
        with open(recipient, 'r') as f:
            recipients = [line.strip() for line in f if line.strip() and '@' in line]
        print(f"Found {len(recipients)} recipients")
        
        if not args.yes:
            if input("Process all? (yes/no): ").lower() != 'yes':
                print("Cancelled")
                sys.exit(0)
        
        success_count = 0
        for email in recipients:
            print(f"\nProcessing {email}...")
            if invoke_lambda_for_email(email):
                success_count += 1
            else:
                if send_email(email):
                    success_count += 1
            # Small delay to avoid rate limits
            import time
            time.sleep(0.5)
        
        print(f"\n✅ Processed {success_count}/{len(recipients)} successfully")
    else:
        # Single recipient
        if use_lambda:
            invoke_lambda_for_email(recipient)
        else:
            send_email(recipient)

if __name__ == '__main__':
    main()

