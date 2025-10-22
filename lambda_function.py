import json
import boto3
import os
from datetime import datetime, timedelta
from decimal import Decimal
import math
import hashlib
import hmac
import base64
import secrets
import string
import urllib.request
import urllib.parse
import urllib.error
import stripe
import requests

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table = dynamodb.Table('frontend-users')
billing_table = dynamodb.Table('billing-admins')
billing_user_from_tenant_table = dynamodb.Table('billinguser-from-tenant-dev')
bucket_name = os.environ['BUCKET_NAME']
openai_api_key = os.environ.get('OPENAI_API_KEY')
google_client_id = os.environ.get('GOOGLE_CLIENT_ID')
google_client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
stripe_secret_key = os.environ.get('STRIPE_SECRET_KEY')
stripe_webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET')
stripe_initial_payment_url = os.environ.get('STRIPE_INITIAL_PAYMENT_URL')
stripe_customer_portal_url = os.environ.get('STRIPE_CUSTOMER_PORTAL_URL')
stripe_product_id = os.environ.get('STRIPE_PRODUCT_ID')
payment_enforced = os.environ.get('PAYMENT_ENABLED', 'false').lower() != 'false'  # Default to false for demo, set to 'true' to enforce
print(f"Payment enforcement toggle: PAYMENT_ENABLED={os.environ.get('PAYMENT_ENABLED')}, resolved to: {payment_enforced}")

# Initialize Stripe
if stripe_secret_key:
    stripe.api_key = stripe_secret_key

# Custom JSON encoder to handle Decimal objects
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

def lambda_handler(event, context):
    """Main Lambda handler for JSON Block Builder API"""
    try:
        # Check if this is an authorizer request
        if 'type' in event and event['type'] == 'TOKEN':
            return handle_authorizer(event)
        
        # Strict parsing: expect top-level 'type' and 'body'. Body is JSON string or object.
        if not isinstance(event, dict) or 'type' not in event or 'body' not in event:
            return create_response(400, {'error': "Invalid request format. Expected top-level 'type' and 'body'."})

        request_type = event.get('type')
        raw_body = event.get('body')
        if isinstance(raw_body, str):
            try:
                body = json.loads(raw_body)
            except json.JSONDecodeError:
                return create_response(400, {'error': 'Invalid JSON in request body'})
        elif isinstance(raw_body, dict):
            body = raw_body
        else:
            return create_response(400, {'error': 'Invalid body: must be JSON object or JSON string'})
        extension = body.get('extension')
        
        # Validate required fields (except for auth which can work without extension)
        if not extension and request_type not in ['auth', 'oauth_token_exchange']:
            return create_response(400, {'error': 'extension is required'})
        
        if not request_type:
            return create_response(400, {'error': 'type is required'})
        
        # Route to appropriate handler
        if request_type == 'register':
            return handle_register(body)
        elif request_type == 'del':
            return handle_delete(body)
        elif request_type == 'json':
            return handle_json(body, event)
        elif request_type == 'llm':
            return handle_llm(body)
        elif request_type == 'llm-preload':
            return handle_llm_preload(body)
        elif request_type == 'auth':
            return handle_auth(body)
        elif request_type == 'admin_delete':
            return handle_admin_delete(body)
        elif request_type == 'create_user':
            return handle_create_user(body)
        elif request_type == 'manage_oauth_scopes':
            return handle_manage_oauth_scopes(body, event)
        elif request_type == 'oauth_token_exchange':
            return handle_oauth_token_exchange(body)
        elif request_type == 'bill':
            return handle_bill(body)
        elif request_type == 'create_account_link':
            return handle_create_account_link(body)
        elif request_type == 'check_account_status':
            return handle_check_account_status(body)
        elif request_type == 'debit_tokens':
            return handle_debit_tokens(body)
        else:
            return create_response(400, {'error': f'Invalid request type: {request_type}'})
            
    except json.JSONDecodeError:
        return create_response(400, {'error': 'Invalid JSON in request body'})
    except Exception as e:
        print(f"Error: {str(e)}")
        return create_response(500, {'error': 'Internal server error'})

def handle_authorizer(event):
    """Handle API Gateway authorizer requests"""
    try:
        # Extract authorization header
        auth_header = event.get('authorizationToken', '')
        
        if not auth_header.startswith('Basic '):
            return generate_policy('user', 'Deny', event['methodArn'])
        
        # Decode Basic Auth
        import base64
        encoded_credentials = auth_header.replace('Basic ', '')
        decoded_credentials = base64.b64decode(encoded_credentials).decode('utf-8')
        username, password = decoded_credentials.split(':', 1)
        
        # Verify credentials against DynamoDB
        if verify_passcode(username, password):
            return generate_policy(username, 'Allow', event['methodArn'])
        else:
            return generate_policy('user', 'Deny', event['methodArn'])
            
    except Exception as e:
        print(f"Authorizer error: {str(e)}")
        return generate_policy('user', 'Deny', event['methodArn'])

def generate_policy(principal_id, effect, resource):
    """Generate IAM policy for API Gateway"""
    return {
        'principalId': principal_id,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [{
                'Action': 'execute-api:Invoke',
                'Effect': effect,
                'Resource': resource
            }]
        }
    }

def create_response(status_code, body):
    """Create a standardized API Gateway response with full CORS headers"""
    response = {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,GET,OPTIONS,PUT,DELETE'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }
    
    # For error responses, make sure the status code is in the error message
    # so API Gateway can map it correctly
    if status_code >= 400:
        response['body'] = json.dumps({
            **body,
            'statusCode': status_code
        }, cls=DecimalEncoder)
    
    return response

def generate_salt():
    """Generate a unique salt for each user"""
    return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))

def hash_passcode(passcode, salt):
    """Hash a passcode using HMAC-SHA256 with a unique salt"""
    return base64.b64encode(
        hmac.new(
            salt.encode('utf-8'),
            passcode.encode('utf-8'),
            hashlib.sha256
        ).digest()
    ).decode('utf-8')

def verify_passcode(tenant_id, passcode):
    """Verify a passcode for a tenant"""
    try:
        # First get the user to retrieve their salt
        response = table.get_item(
            Key={
                'tenantId': tenant_id,
                'type': 'tenant'
            }
        )
        
        if 'Item' not in response:
            return False
            
        user_item = response['Item']
        stored_hash = user_item.get('passcode')
        salt = user_item.get('salt')
        
        if not stored_hash or not salt:
            return False
            
        # Hash the provided passcode with the stored salt
        provided_hash = hash_passcode(passcode, salt)
        
        return provided_hash == stored_hash
    except Exception as e:
        print(f"Error verifying passcode: {str(e)}")
        return False

def handle_register(body):
    """Handle new user registration with Google OAuth"""
    email = body.get('email')
    tenants = body.get('tenants', [])
    google_access_token = body.get('google_access_token')
    
    if not email:
        return create_response(400, {'error': 'email is required for registration'})
    
    if not google_access_token:
        return create_response(400, {'error': 'google_access_token is required for registration'})
    
    try:
        # Verify Google access token and get user info
        auth_result = verify_google_token_and_scopes(google_access_token, 'default', 'read')
        if not auth_result['valid']:
            return create_response(401, {'error': f'Google authentication failed: {auth_result["error"]}'})
        
        # Verify the email matches the Google account
        if auth_result['user_email'].lower() != email.lower():
            return create_response(400, {'error': 'Email does not match Google account'})
        
        user_email = auth_result['user_email']
        google_user_id = auth_result['google_user_id']
        
        print(f"Registering new user: {user_email} with {len(tenants)} tenants")
        
        # Step 1: Create billing user record with 0 tokens
        try:
            billing_table.put_item(
                Item={
                    'user_email': user_email,
                    'google_user_id': google_user_id,
                    'token_balance': Decimal('0'),
                    'total_tokens_purchased': Decimal('0'),
                    'created_at': datetime.utcnow().isoformat(),
                    'last_activity': datetime.utcnow().isoformat(),
                    'account_status': 'active',
                    'managed_tenants': [],  # Will be deprecated in favor of new table
                    'created_via': 'registration'
                },
                ConditionExpression='attribute_not_exists(user_email)'
            )
            print(f"Created billing user record for {user_email}")
        except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
            # User already exists in billing table - that's okay, continue
            print(f"Billing user {user_email} already exists, continuing with tenant registration")
        except Exception as e:
            print(f"Error creating billing user: {str(e)}")
            return create_response(500, {'error': 'Failed to create billing account'})
        
        # Step 2: Register tenants (skip failed ones, don't fail the whole request)
        successful_tenants = []
        failed_tenants = []
        
        for tenant_name in tenants:
            if not tenant_name or not isinstance(tenant_name, str):
                failed_tenants.append(tenant_name)
                continue
                
            # Validate tenant name format
            tenant_name = tenant_name.lower().strip()
            if not tenant_name or not tenant_name.replace('-', '').replace('_', '').isalnum():
                failed_tenants.append(tenant_name)
                continue
            
            try:
                # Try to create tenant mapping
                billing_user_from_tenant_table.put_item(
                    Item={
                        'tenant_id': tenant_name,
                        'user_email': user_email,
                        'created_at': datetime.utcnow().isoformat(),
                        'source': 'user_registration'
                    },
                    ConditionExpression='attribute_not_exists(tenant_id)'
                )
                successful_tenants.append(tenant_name)
                print(f"Successfully registered tenant: {tenant_name} for {user_email}")
                
            except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
                # Tenant already taken
                failed_tenants.append(tenant_name)
                print(f"Tenant {tenant_name} already taken")
            except Exception as e:
                print(f"Error registering tenant {tenant_name}: {str(e)}")
                failed_tenants.append(tenant_name)
        
        # Step 3: Query the user GSI to get final tenant list
        try:
            response = billing_user_from_tenant_table.query(
                IndexName='UserEmailIndex',
                KeyConditionExpression='user_email = :email',
                ExpressionAttributeValues={':email': user_email}
            )
            
            all_user_tenants = [item['tenant_id'] for item in response['Items']]
            print(f"User {user_email} now has tenants: {all_user_tenants}")
            
        except Exception as e:
            print(f"Error querying user tenants: {str(e)}")
            all_user_tenants = successful_tenants  # Fallback to what we know succeeded
        
        # Return success response
        return create_response(200, {
            'success': True,
            'message': 'Registration completed successfully',
            'user_email': user_email,
            'google_user_id': google_user_id,
            'token_balance': 0,
            'tenants': successful_tenants,
            'failed_tenants': failed_tenants,
            'all_tenants': all_user_tenants,
            'created_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"Error in user registration: {str(e)}")
        return create_response(500, {'error': 'Registration failed: ' + str(e)})

def handle_delete(body):
    """Handle schema deletion"""
    schema_files = body.get('schema', [])
    
    if not schema_files:
        return create_response(400, {'error': 'schema list is required for delete operation'})
    
    deleted_files = []
    failed_files = []
    
    for filename in schema_files:
        try:
            s3.delete_object(
                Bucket=bucket_name,
                Key=f"schemas/{body['extension']}/{filename}"
            )
            deleted_files.append(filename)
        except Exception as e:
            print(f"Error deleting {filename}: {str(e)}")
            failed_files.append(filename)
    
    response_body = {
        'message': f'Deleted {len(deleted_files)} schema files',
        'deleted_files': deleted_files
    }
    
    if failed_files:
        response_body['failed_files'] = failed_files
    
    return create_response(200, response_body)

def handle_json(body, event=None):
    """Handle JSON schema upload"""
    schema_list = body.get('schema', [])
    
    if not schema_list:
        return create_response(400, {'error': 'schema list is required for json operation'})
    
    # Check for write permission if Google OAuth token is provided
    google_access_token = body.get('google_access_token')
    billing_admin_data = None
    billing_user_email = None
    
    # Extract X-Billing-User header for meta tenant billing ownership
    if event and 'headers' in event:
        headers = event['headers']
        billing_user_email = headers.get('X-Billing-User') or headers.get('x-billing-user')
        if billing_user_email:
            print(f"Found X-Billing-User header: {billing_user_email}")
    
    if google_access_token:
        auth_result = verify_google_token_and_scopes(google_access_token, body.get('extension'), 'write')
        if not auth_result['valid']:
            return create_response(401, {'error': f'Authentication failed: {auth_result["error"]}'})
        
        if 'write' not in auth_result['scopes'] and 'admin' not in auth_result['scopes']:
            return create_response(403, {'error': 'Write permission required for JSON schema upload'})
        
        # Capture billing administrator data for this tenant
        billing_admin_data = {
            'google_user_id': auth_result['google_user_id'],
            'user_email': auth_result['user_email'],
            'tenant_id': body.get('extension'),
            'last_activity': datetime.utcnow().isoformat()
        }
        
        # Override with X-Billing-User if provided (for meta tenant)
        if billing_user_email:
            billing_admin_data['user_email'] = billing_user_email
    elif billing_user_email:
        # Create billing admin data from X-Billing-User header (for meta tenant without OAuth)
        billing_admin_data = {
            'google_user_id': None,  # Will be set later when user authenticates
            'user_email': billing_user_email,
            'tenant_id': body.get('extension'),
            'last_activity': datetime.utcnow().isoformat()
        }
    
    uploaded_schemas = []
    failed_schemas = []
    properties = body.get('properties', {})
    if len(properties) > 0:
        file_contents = ""
        for key, value in properties.items():
            file_contents += f"{key}={value}\n"
        s3.put_object(
            Bucket=bucket_name,
            Key=f"schemas/{body['extension']}/tenant.properties",
            Body=file_contents
        )
    
    # Handle loose endpoints if provided
    endpoints = body.get('endpoints', [])
    if endpoints:
        # Save loose endpoints as plain text file
        endpoints_content = "\n".join(endpoints)
        s3.put_object(
            Bucket=bucket_name,
            Key=f"schemas/{body['extension']}/endpoints.properties",
            Body=endpoints_content
        )
        uploaded_schemas.append("endpoints.properties")
    
    for i, schema_json in enumerate(schema_list):
        try:
            # Validate that the schema is valid JSON
            schema_data = json.loads(schema_json)
            
            # Generate a filename based on schema title or use index
            filename = f"schema_{i}.json"
            if isinstance(schema_data, dict) and '$id' in schema_data:
                # Use the title as filename, sanitized
                title = schema_data['$id'].replace(' ', '_').replace('/', '_').replace('\\', '_')
                filename = title if title.endswith('.json') else f"{title}.json"
            
            # Upload to S3
            s3.put_object(
                Bucket=bucket_name,
                Key=f"schemas/{body['extension']}/{filename}",
                Body=json.dumps(schema_data, indent=2),
            )
            
            uploaded_schemas.append(filename)
            
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON schema {i}: {str(e)}")
            failed_schemas.append(f"schema_{i} (invalid JSON)")
        except Exception as e:
            print(f"Error uploading schema {i}: {str(e)}")
            failed_schemas.append(f"schema_{i}")
    
    # Store billing administrator data if we have it
    if billing_admin_data and len(uploaded_schemas) > 0:
        try:
            # Check if billing admin already exists
            existing_admin = billing_table.get_item(
                Key={'user_email': billing_admin_data['user_email']}
            )
            
            if 'Item' not in existing_admin:
                # Don't create new billing administrator - require payment setup first
                print(f"Billing admin {billing_admin_data['user_email']} not found - payment setup required")
                if payment_enforced:
                    return create_response(402, {
                        'error': 'Payment setup required. Please complete billing setup before uploading schemas.',
                        'payment_required': True,
                        'user_email': billing_admin_data['user_email']
                    })
                else:
                    print("Payment disabled - allowing schema upload without billing setup")
            else:
                # Update existing billing administrator - only append to managed_tenants
                existing_tenants = existing_admin['Item'].get('managed_tenants', [])
                if billing_admin_data['tenant_id'] not in existing_tenants:
                    existing_tenants.append(billing_admin_data['tenant_id'])
                    
                    billing_table.update_item(
                        Key={'user_email': billing_admin_data['user_email']},
                        UpdateExpression='SET managed_tenants = :tenants, last_activity = :activity',
                        ExpressionAttributeValues={
                            ':tenants': existing_tenants,
                            ':activity': billing_admin_data['last_activity']
                        }
                    )
                    print(f"Added tenant {billing_admin_data['tenant_id']} to existing billing admin {billing_admin_data['user_email']}")
        except Exception as e:
            print(f"Error storing billing administrator data: {str(e)}")
            return create_response(500, {'error': 'Failed to process billing administrator data'})
    
    # Add user to frontend-users table with read/write/admin scopes if X-Billing-User header was provided
    if billing_user_email and body.get('extension'):
        try:
            tenant_id = body.get('extension')
            target_sort_key = f'oauth_scopes#{billing_user_email}'
            
            # Add user with full permissions (read, write, admin) to frontend-users table
            table.put_item(
                Item={
                    'tenantId': tenant_id,
                    'type': target_sort_key,
                    'user_email': billing_user_email,
                    'scopes': ['read', 'write', 'admin'],
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat(),
                    'managed_by': 'system_billing_setup'
                }
            )
            print(f"Added user {billing_user_email} to frontend-users table for tenant {tenant_id} with full permissions")
        except Exception as e:
            print(f"Error adding user to frontend-users table: {str(e)}")
            # Don't fail the request if user scope setup fails
    
    response_body = {
        'message': f'Uploaded {len(uploaded_schemas)} schemas',
        'uploaded_schemas': uploaded_schemas
    }
    
    if failed_schemas:
        response_body['failed_schemas'] = failed_schemas
    
    return create_response(200, response_body)

def handle_llm(body):
    """Handle LLM schema generation using OpenAI"""
    schema_definitions = body.get('schema', [])
    
    if not schema_definitions:
        return create_response(400, {'error': 'schema list is required for llm operation'})
    
    if not openai_api_key:
        return create_response(500, {'error': 'OpenAI API key not configured'})
    
    try:
        # Debit tokens for LLM schema generation (10 tokens) - always bill when billing user found
        billing_user_email = get_billing_user_for_tenant(body['extension'])
        if billing_user_email:
            debit_success = debit_tokens_from_user(billing_user_email, 10, 'llm-generate')
            if not debit_success:
                print(f"Warning: Failed to debit tokens for llm-generate, but allowing operation to continue")
        
        # Convert plain English descriptions to JSON schemas using OpenAI
        generated_schemas = []
        failed_schemas = []
        
        for i, description in enumerate(schema_definitions):
            try:
                # Generate JSON schema from plain English description
                json_schema = generate_schema_from_description(description)
                generated_schemas.append(json_schema)
            except Exception as e:
                print(f"Error generating schema for description {i}: {str(e)}")
                failed_schemas.append(f"description_{i}")
        
        # Now process the generated schemas the same way as the json endpoint
        uploaded_schemas = []
        properties = body.get('properties', {})
        
        # Handle tenant properties if provided
        if len(properties) > 0:
            file_contents = ""
            for key, value in properties.items():
                file_contents += f"{key}={value}\n"
            s3.put_object(
                Bucket=bucket_name,
                Key=f"schemas/{body['extension']}/tenant.properties",
                Body=file_contents
            )
        
        # Upload generated schemas to S3
        for i, schema_json in enumerate(generated_schemas):
            try:
                # Validate that the schema is valid JSON
                schema_data = json.loads(schema_json)
                
                # Generate a filename based on schema title or use index
                filename = f"schema_{i}.json"
                if isinstance(schema_data, dict) and '$id' in schema_data:
                    # Use the title as filename, sanitized
                    title = schema_data['$id'].replace(' ', '_').replace('/', '_').replace('\\', '_')
                    filename = title if title.endswith('.json') else f"{title}.json"
                
                # Upload to S3
                s3.put_object(
                    Bucket=bucket_name,
                    Key=f"schemas/{body['extension']}/{filename}",
                    Body=json.dumps(schema_data, indent=2),
                )
                
                uploaded_schemas.append(filename)
                
            except json.JSONDecodeError as e:
                print(f"Error parsing generated JSON schema {i}: {str(e)}")
                failed_schemas.append(f"generated_schema_{i} (invalid JSON)")
            except Exception as e:
                print(f"Error uploading generated schema {i}: {str(e)}")
                failed_schemas.append(f"generated_schema_{i}")
        
        response_body = {
            'message': f'Generated and uploaded {len(uploaded_schemas)} schemas from LLM',
            'uploaded_schemas': uploaded_schemas,
            'generated_count': len(generated_schemas),
            'created_schemas': generated_schemas  # Return the actual schema content
        }
        
        if failed_schemas:
            response_body['failed_schemas'] = failed_schemas
        
        return create_response(200, response_body)
        
    except Exception as e:
        print(f"Error in LLM processing: {str(e)}")
        return create_response(500, {'error': 'Failed to process LLM request'})

def handle_llm_preload(body):
    """Handle LLM preload - generate JSON object that complies with existing schemas"""
    # Extract the actual request data from the API Gateway wrapper
    request_data = body.get('body', body)
    tenant_id = request_data.get('extension')
    user_prompt = request_data.get('prompt', '')
    
    if not tenant_id:
        return create_response(400, {'error': 'extension is required for llm-preload operation'})
    
    if not user_prompt:
        return create_response(400, {'error': 'prompt is required for llm-preload operation'})
    
    if not openai_api_key:
        return create_response(500, {'error': 'OpenAI API key not configured'})
    
    try:
        print(f"Loading schemas for tenant: {tenant_id}")
        print(f"Using bucket: {bucket_name}")
        
        # Debit tokens for LLM preload operation (10 tokens) - always bill when billing user found
        billing_user_email = get_billing_user_for_tenant(tenant_id)
        if billing_user_email:
            debit_success = debit_tokens_from_user(billing_user_email, 10, 'llm-preload')
            if not debit_success:
                print(f"Warning: Failed to debit tokens for llm-preload, but allowing operation to continue")
        
        # Load all schemas for the tenant from S3
        schemas = load_tenant_schemas(tenant_id)
        
        print(f"Found {len(schemas)} schemas for tenant {tenant_id}")
        for schema in schemas:
            print(f"Schema: {schema['id']} - {schema['filename']}")
        
        if not schemas:
            return create_response(404, {'error': 'No schemas found for tenant'})
        
        # Generate JSON object that complies with one of the schemas
        result = generate_compliant_json_object(schemas, user_prompt, tenant_id)
        
        if result['success']:
            return create_response(200, {
                'message': 'Successfully generated compliant JSON object',
                'json_object': result['json_object'],
                'root_schema': result['root_schema'],
                'attempts': result['attempts']
            })
        else:
            return create_response(400, {
                'error': 'Failed to generate compliant JSON object',
                'errors': result['errors'],
                'attempts': result['attempts']
            })
            
    except Exception as e:
        print(f"Error in LLM preload processing: {str(e)}")
        return create_response(500, {'error': 'Failed to process LLM preload request'})

def load_tenant_schemas(tenant_id):
    """Load all schemas for a tenant from S3"""
    schemas = []
    
    try:
        print(f"Listing objects in S3 bucket: {bucket_name}")
        print(f"Prefix: schemas/{tenant_id}/")
        
        # List all objects in the tenant's schema folder
        response = s3.list_objects_v2(
            Bucket=bucket_name,
            Prefix=f"schemas/{tenant_id}/"
        )
        
        print(f"S3 response: {response}")
        
        if 'Contents' not in response:
            print("No Contents found in S3 response")
            return schemas
        
        for obj in response['Contents']:
            key = obj['Key']
            # Skip tenant.properties file
            if key.endswith('tenant.properties'):
                continue
                
            # Only process JSON files
            if key.endswith('.json'):
                try:
                    # Get the object content
                    obj_response = s3.get_object(Bucket=bucket_name, Key=key)
                    schema_content = obj_response['Body'].read().decode('utf-8')
                    schema_data = json.loads(schema_content)
                    
                    # Extract schema ID for reference
                    schema_id = schema_data.get('$id', key.split('/')[-1])
                    schemas.append({
                        'id': schema_id,
                        'schema': schema_data,
                        'filename': key.split('/')[-1]
                    })
                    
                except Exception as e:
                    print(f"Error loading schema {key}: {str(e)}")
                    continue
                    
    except Exception as e:
        print(f"Error listing schemas for tenant {tenant_id}: {str(e)}")
    
    return schemas

def generate_compliant_json_object(schemas, user_prompt, tenant_id):
    """Generate a JSON object that complies with one of the provided schemas"""
    try:
        import jsonschema
        from jsonschema import validate, ValidationError, RefResolver
        jsonschema_available = True
    except ImportError:
        print("Warning: jsonschema module not available, using basic validation")
        jsonschema_available = False
    
    # Create context string with all schemas
    schema_context = "Available schemas for this tenant:\n\n"
    for schema_info in schemas:
        schema_context += f"Schema ID: {schema_info['id']}\n"
        schema_context += f"Title: {schema_info['schema'].get('title', 'N/A')}\n"
        schema_context += f"Description: {schema_info['schema'].get('description', 'N/A')}\n"
        schema_context += f"Properties: {json.dumps(schema_info['schema'].get('properties', {}), indent=2)}\n"
        schema_context += f"Required fields: {schema_info['schema'].get('required', [])}\n\n"
    
    system_prompt = """You are a JSON object generator. You will be given a list of JSON schemas and a user prompt describing what object to create.

""" + schema_context + """

Your task:
1. Analyze the user prompt and determine which schema it best matches
2. Generate a JSON object that complies EXACTLY with that schema
3. Include ALL required fields from the schema
4. Use appropriate values that match the user's description
5. Return ONLY the JSON object, no explanations

Requirements:
- The JSON object must be valid JSON
- Keys inside of objects must use the provided casing. Do not ever try to change the casing of object keys, only referenced schemas.
- It must include all required fields from the chosen schema
- Field values should match the user's description
- Use appropriate data types (string, number, boolean, array, object)
- For arrays, include at least one item if the user describes multiple items
- For objects with $ref, create a simple object with the referenced properties
- Objects must be nested if appropriate, and include optional fields if they are provided by the user.
- It is generally ACCEPTABLE to use any info in your corpus for a best guess at the values for fields, so long as they are valid for the schema.
- The user will have an opportunity to view/edit the entire JSON object after it is generated for mistaken values, but you must comply with the schema for the page to load properly.

For the json object:

Example schema format:
{
  "$schema": "https://json-schema.org/draft/2019-09/schema",
  "$id": "example.json",
  "title": "Example",
  "description": "An example object",
  "type": "object",
  "color": 120,
  "properties": {
    "flightRoutes": {
      "description": "List of flightroute objects (minimum 1 required)",
      "type": "array",
      "items": {
        "$ref": "flightroute.json"
      },
      "minItems": 1
    },
    "airport_dict": {
        "description": "A airport_dict should be created with arbitrary strings as keys, and all values as valid airport objects",
        "type": "object",
        "$ref": "airport.json"
    },
    "brandLink": {
      "description": "A single string",
      "type": "string"
    },
    "redirectLinks": {
      "description": "LIST OF strings. Type inside of items always indicates a primitive value. $ref inside of items always indicates a reference to another schema.",
      "type": "array",
      "items": {
        "type": "string"
      },
    },
    "hub": {
      "description": "A single child object",
      "$ref": "airport.json"
    }
  },
  "required": ["hub"]
}

airport and flightroute schemas are very simple/unimportant in this example, are are omitted for brevity.

A sample return complying with the previous schema would be:
{
  "detected_schema": "example",
  "json_object": {
    "flightRoutes": [
        {
        "routeName" : "value",
        }
    ],
    "brandLink": "value",
    "redirectLinks": ["value", "value"],
    "airport_dict": {
        "key_1": {
        "airportName": "value"
        }
    },
    "hub": {
        "airportName": "value"
    }
  }
}

Be sure to distinctly include both detected_schema and json_object (compliant) in your response.
"""

    user_prompt_text = f"User request: {user_prompt}"
    
    max_attempts = 3
    attempts = 0
    
    while attempts < max_attempts:
        attempts += 1
        
        try:
            # Generate JSON object using OpenAI
            generated_response = call_openai_api(system_prompt, user_prompt_text)
            print(f"LLM Response on attempt {attempts}: {generated_response}")
            
            # Parse the response
            response_data = json.loads(generated_response)
            detected_schema_id = response_data.get('detected_schema')
            json_object = response_data.get('json_object')
            
            print(f"Detected schema ID: {detected_schema_id}")
            print(f"Generated JSON object: {json.dumps(json_object, indent=2)}")
            
            if not detected_schema_id or not json_object:
                raise Exception("Invalid response format from OpenAI")
            
            # Normalize schema ID by adding .json extension if missing
            if not detected_schema_id.endswith(".json"):
                detected_schema_id = detected_schema_id + ".json"
                print(f"Normalized schema ID to: {detected_schema_id}")
            
            # Find the matching schema
            matching_schema = None
            print(f"Looking for schema with ID: '{detected_schema_id}'")
            for schema_info in schemas:
                print(f"Checking schema - ID: '{schema_info['id']}', Filename: '{schema_info['filename']}'")
                if schema_info['id'] == detected_schema_id or schema_info['filename'] == detected_schema_id:
                    matching_schema = schema_info['schema']
                    print(f"Found matching schema: {schema_info['id']}")
                    break
            
            if not matching_schema:
                available_schemas = [f"ID: '{s['id']}', Filename: '{s['filename']}'" for s in schemas]
                raise Exception(f"Schema '{detected_schema_id}' not found in available schemas. Available: {available_schemas}")
            
            # Validate the JSON object against the schema
            if jsonschema_available:
                try:
                    # Create a schema store for resolving $ref references
                    schema_store = {}
                    for schema_info in schemas:
                        # Use the schema ID as the key for the store
                        schema_id = schema_info['id']
                        schema_store[schema_id] = schema_info['schema']
                        print(f"Added schema to store: {schema_id}")
                    
                    print(f"Schema store keys: {list(schema_store.keys())}")
                    
                    # Create a resolver with the schema store
                    resolver = RefResolver(base_uri="", referrer=matching_schema, store=schema_store)
                    print(f"Created resolver for validation of schema: {detected_schema_id}")
                    
                    # Validate with the resolver
                    validate(instance=json_object, schema=matching_schema, resolver=resolver)
                    
                    # Success! Return the result
                    return {
                        'success': True,
                        'json_object': json_object,
                        'root_schema': detected_schema_id,
                        'attempts': attempts
                    }
                    
                except ValidationError as e:
                    validation_error = str(e)
                    print(f"Validation error on attempt {attempts}: {validation_error}")
                    
                    if attempts < max_attempts:
                        # Add validation error to the prompt for retry
                        user_prompt_text += f"\n\nValidation error from previous attempt: {validation_error}\nPlease fix the JSON object to comply with the schema."
                    else:
                        # Final attempt failed
                        return {
                            'success': False,
                            'errors': [validation_error],
                            'attempts': attempts
                        }
                except Exception as e:
                    # Don't return errors for schema resolution issues, just log and continue
                    print(f"Schema validation error on attempt {attempts} (continuing): {str(e)}")
                    # Treat as success since we don't want to fail on schema resolution issues
                    return {
                        'success': True,
                        'json_object': json_object,
                        'root_schema': detected_schema_id,
                        'attempts': attempts
                    }
            else:
                # Basic validation without jsonschema
                print("Skipping schema validation (jsonschema not available)")
                return {
                    'success': True,
                    'json_object': json_object,
                    'root_schema': detected_schema_id,
                    'attempts': attempts
                }
                    
        except json.JSONDecodeError as e:
            error_msg = f"Invalid JSON response from OpenAI: {str(e)}"
            print(f"JSON decode error on attempt {attempts}: {error_msg}")
            
            if attempts < max_attempts:
                user_prompt_text += f"\n\nPrevious response was invalid JSON. Please ensure your response is valid JSON."
            else:
                return {
                    'success': False,
                    'errors': [error_msg],
                    'attempts': attempts
                }
                
        except Exception as e:
            error_msg = f"Error generating JSON object: {str(e)}"
            print(f"Error on attempt {attempts}: {error_msg}")
            
            if attempts < max_attempts:
                user_prompt_text += f"\n\nPrevious attempt failed: {error_msg}\nPlease try again."
            else:
                return {
                    'success': False,
                    'errors': [error_msg],
                    'attempts': attempts
                }
    
    return {
        'success': False,
        'errors': ['Maximum attempts reached'],
        'attempts': attempts
    }

def call_openai_api(system_prompt, user_prompt):
    """Call OpenAI API and return the response"""
    headers = {
        'Authorization': f'Bearer {openai_api_key}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'model': 'gpt-3.5-turbo',
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt}
        ],
        'max_tokens': 2000,
        'temperature': 0.3
    }
    
    # Convert payload to JSON bytes
    data = json.dumps(payload).encode('utf-8')
    
    # Create request
    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=data,
        headers=headers,
        method='POST'
    )
    
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise Exception(f"OpenAI API error: {response.status} - {response.read().decode()}")
        
        result = json.loads(response.read().decode())
    
    if 'choices' not in result or len(result['choices']) == 0:
        raise Exception("No response from OpenAI API")
    
    generated_content = result['choices'][0]['message']['content'].strip()
    
    # Remove any markdown formatting if present
    if generated_content.startswith('```json'):
        generated_content = generated_content[7:]
    if generated_content.endswith('```'):
        generated_content = generated_content[:-3]
    
    return generated_content.strip()

def generate_schema_from_description(description):
    """Generate JSON schema from plain English description using OpenAI"""
    
    # Pre-prompt for the API call
    system_prompt = """You are a JSON Schema expert. Convert plain English descriptions into valid JSON Schema format.

Requirements:
1. Return ONLY valid JSON Schema (JSON Schema Draft 2019-09)
2. Include $schema, $id, title, description, type, and properties
3. Use appropriate data types (string, number, integer, boolean, array, object)
4. Add descriptions for all properties
5. Include required fields where appropriate
6. Use enums for limited choices
6. Add color property (0-360) for visual representation. These are hue-only values, so 0 and 360 are red, 120 is green, 240 is blue, etc.
7. Return ONLY the JSON schema, no explanations or markdown
8. Use $ref for references to subobjects using the id of other schemas within this request.
9. Use type array and $ref inside of items for references to a LIST of subobjects using the id of other schemas within this request.
10. Guess which fields should be required IF NOT PROVIDED by the user.
11. $id and $ref of the filename of the schema must always be all lowercase.

Example format:
{
  "$schema": "https://json-schema.org/draft/2019-09/schema",
  "$id": "example.json",
  "title": "Example",
  "description": "An example object",
  "type": "object",
  "color": 120,
  "properties": {
    "flightRoutes": {
      "description": "List of flightroute objects (minimum 1 required)",
      "type": "array",
      "items": {
        "$ref": "flightroute.json"
      },
      "minItems": 1
    },
    "airport_dict": {
        "description": "A airport_dict should be created with arbitrary strings as keys, and all values as valid airport objects",
        "type": "object",
        "$ref": "airport.json"
    },
    "brandLink": {
      "description": "A single string",
      "type": "string"
    },
    "redirectLinks": {
      "description": "LIST OF strings. Type inside of items always indicates a primitive value. $ref inside of items always indicates a reference to another schema.",
      "type": "array",
      "items": {
        "type": "string"
      },
    },
    "hub": {
      "description": "A single child object",
      "$ref": "airport.json"
    }
  },
  "required": ["hub"]
}

A sample object complying with the previous would be:
{
  "flightRoutes": [
    {
      "routeName" : "value",
    }
  ],
  "brandLink": "value",
  "redirectLinks": ["value", "value"],
  "airport_dict": {
    "key_1": {
      "airportName": "value"
    }
  },
  "hub": {
    "airportName": "value"
  }
}
"""

    user_prompt = f"Convert this description to JSON Schema: {description}"
    
    headers = {
        'Authorization': f'Bearer {openai_api_key}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'model': 'gpt-3.5-turbo',
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt}
        ],
        'max_tokens': 1000,
        'temperature': 0.3
    }
    
    # Convert payload to JSON bytes
    data = json.dumps(payload).encode('utf-8')
    
    # Create request
    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=data,
        headers=headers,
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status != 200:
                raise Exception(f"OpenAI API error: {response.status} - {response.read().decode()}")
            
            result = json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else "Unknown error"
        raise Exception(f"OpenAI API HTTP error: {e.code} - {error_body}")
    except urllib.error.URLError as e:
        raise Exception(f"OpenAI API URL error: {str(e)}")
    
    if 'choices' not in result or len(result['choices']) == 0:
        raise Exception("No response from OpenAI API")
    
    generated_schema = result['choices'][0]['message']['content'].strip()
    
    # Remove any markdown formatting if present
    if generated_schema.startswith('```json'):
        generated_schema = generated_schema[7:]
    if generated_schema.endswith('```'):
        generated_schema = generated_schema[:-3]
    
    return generated_schema.strip()

def verify_google_token_and_permissions(access_token, tenant_id):
    """Verify Google access token and get user permissions from DynamoDB"""
    try:
        print(f"🔍 TOKEN DEBUG: Verifying token for tenant={tenant_id}")
        print(f"🔍 TOKEN DEBUG: Token preview: {access_token[:20]}...")
        
        # Verify the Google access token and get user info
        headers = {'Authorization': f'Bearer {access_token}'}
        req = urllib.request.Request(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers=headers
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            print(f"🔍 TOKEN DEBUG: Google API response status: {response.status}")
            if response.status != 200:
                return {'valid': False, 'error': 'Invalid Google access token'}
            
            user_info = json.loads(response.read().decode())
            google_user_id = user_info.get('id')  # Use Google's unique user ID
            user_email = user_info.get('email')   # Keep email for display purposes only
            
            print(f"🔍 TOKEN DEBUG: Got user info - id={google_user_id}, email={user_email}")
            
            if not google_user_id:
                return {'valid': False, 'error': 'Unable to get Google user ID'}
        
        # Get user permissions from DynamoDB
        permissions = get_user_permissions_for_tenant(tenant_id, user_email)
        print(f"🔍 TOKEN DEBUG: Found user permissions: {permissions}")
        
        return {
            'valid': True,
            'google_user_id': google_user_id,
            'user_email': user_email,
            'permissions': permissions,
            'error': None
        }
        
    except urllib.error.HTTPError as e:
        return {'valid': False, 'error': f'Google API error: {e.code}'}
    except urllib.error.URLError as e:
        return {'valid': False, 'error': f'Network error verifying Google token: {str(e)}'}
    except Exception as e:
        print(f"Error verifying Google token: {str(e)}")
        return {'valid': False, 'error': 'Error verifying Google token'}

def get_user_permissions_for_tenant(tenant_id, user_email):
    """Get user permissions from frontend-users table (NOT billing table)"""
    try:
        if not user_email:
            return {'read': False, 'write': False, 'admin': False}
        
        print(f"🔍 PERMISSION DEBUG: Looking up permissions for user email {user_email} in tenant {tenant_id} from frontend-users table")
        
        # Look for the actual data structure: type = "admin" with permissions object
        try:
            response = table.get_item(
                Key={
                    'tenantId': tenant_id,
                    'type': 'admin'
                }
            )
            item = response.get('Item')
            if item and item.get('user_email') == user_email:
                # Extract permissions from the permissions object
                permissions_obj = item.get('permissions', {})
                permissions = {
                    'read': permissions_obj.get('read', {}).get('BOOL', False) if isinstance(permissions_obj.get('read'), dict) else permissions_obj.get('read', False),
                    'write': permissions_obj.get('write', {}).get('BOOL', False) if isinstance(permissions_obj.get('write'), dict) else permissions_obj.get('write', False),
                    'admin': permissions_obj.get('admin', {}).get('BOOL', False) if isinstance(permissions_obj.get('admin'), dict) else permissions_obj.get('admin', False)
                }
                print(f"Found permissions for email {user_email} in tenant {tenant_id}: {permissions}")
                return permissions
        except Exception as e:
            print(f"Error with admin lookup: {str(e)}")
        
        print(f"No permissions found for user email {user_email} in tenant {tenant_id}")
        return {'read': False, 'write': False, 'admin': False}
        
    except Exception as e:
        print(f"Error getting user permissions: {str(e)}")
        return {'read': False, 'write': False, 'admin': False}

def create_stripe_connected_account(user_email):
    """Create a Stripe connected account for a user"""
    try:
        if not stripe_secret_key:
            print("Stripe secret key not configured")
            return None
            
        # Create connected account
        account = stripe.Account.create(
            type='express',
            country='US',
            email=user_email,
            capabilities={
                'card_payments': {'requested': True},
                'transfers': {'requested': True}
            }
        )
        
        print(f"Created Stripe connected account {account['id']} for {user_email}")
        return account
        
    except Exception as e:
        print(f"Error creating Stripe connected account: {str(e)}")
        return None

def handle_auth(body):
    """Handle authentication - supports Google OAuth"""
    tenant_id = body.get('extension')
    passcode = body.get('passcode')
    google_access_token = body.get('google_access_token')
    scope_required = body.get('scope', 'all')  # 'all' means evaluate all scopes
    billing_customer_id = body.get('billing')  # Stripe customer ID for initial billing setup
    
    print(f"🔍 AUTH DEBUG: tenant_id={tenant_id}, has_passcode={bool(passcode)}, has_token={bool(google_access_token)}, scope_required={scope_required}, billing_customer_id={billing_customer_id}")
    print(f"🔍 AUTH DEBUG: google_client_id env var set: {bool(google_client_id)}")
    
    # Handle initial billing setup from Stripe callback
    if billing_customer_id:
        customer_email = body.get('customer_email')
        return handle_billing_setup(billing_customer_id, customer_email)
    if google_access_token:
        print(f"🔍 AUTH DEBUG: Attempting Google OAuth verification...")
        auth_result = verify_google_token_and_permissions(google_access_token, tenant_id)
        print(f"🔍 AUTH DEBUG: Google auth result: valid={auth_result.get('valid')}, error={auth_result.get('error')}")
        if auth_result['valid']:
            # Get permissions from frontend-users table (already retrieved in auth_result)
            permissions = auth_result['permissions']
            
            # Check if user is a billing administrator in the billing-admins table
            is_billing_admin = False
            stripe_account_id = None
            token_balance = 0
            
            try:
                response = billing_table.get_item(
                    Key={'user_email': auth_result['user_email']}
                )
                
                if 'Item' in response:
                    billing_admin = response['Item']
                    # User exists in billing-admins table - they are a billing admin
                    is_billing_admin = True
                    stripe_account_id = billing_admin.get('stripe_account_id')
                    token_balance = int(math.floor(float(billing_admin.get('token_balance', 0))))
                    
                    # Update last activity
                    billing_table.update_item(
                        Key={'user_email': auth_result['user_email']},
                        UpdateExpression='SET last_activity = :activity',
                        ExpressionAttributeValues={':activity': datetime.utcnow().isoformat()}
                    )
                    print(f"Found existing billing admin: {auth_result['user_email']} with {token_balance} tokens")
                else:
                    # Create Stripe connected account for new user
                    print(f"Creating Stripe connected account for {auth_result['user_email']}")
                    stripe_account = create_stripe_connected_account(auth_result['user_email'])
                    if stripe_account:
                        stripe_account_id = stripe_account['id']
                        # Store the account ID in billing-admins table - new user becomes billing admin
                        billing_table.put_item(
                            Item={
                                'user_email': auth_result['user_email'],
                                'google_user_id': auth_result['google_user_id'],
                                'stripe_account_id': stripe_account_id,
                                'managed_tenants': [tenant_id] if tenant_id else [],  # Add current tenant to managed tenants
                                'created_at': datetime.utcnow().isoformat(),
                                'last_activity': datetime.utcnow().isoformat(),
                                'created_via': 'google_oauth',
                                'token_balance': Decimal('0')  # New users start with 0 tokens
                            }
                        )
                        is_billing_admin = True  # New user becomes billing admin
                        token_balance = 0  # New users start with 0 tokens
                        print(f"Created new billing admin with Stripe account {stripe_account_id}")
                    else:
                        print(f"Failed to create Stripe account for {auth_result['user_email']}")
            except Exception as e:
                print(f"Error checking/creating billing admin: {str(e)}")
                # Don't fail auth if billing check fails, just log it
            
            # Add billing permission from billing-admins table
            permissions['billing'] = is_billing_admin
            
            response_data = {
                'message': 'Google OAuth authentication successful',
                'tenantId': tenant_id,
                'authenticated': True,
                'auth_type': 'google_oauth',
                'google_user_id': auth_result['google_user_id'],
                'user_email': auth_result['user_email'],
                'permissions': permissions,
                'token_balance': token_balance
            }
            
            # Include Stripe account info if available
            if stripe_account_id:
                response_data['stripe_account_id'] = stripe_account_id
            
            return create_response(200, response_data)
        else:
            print(f"🔍 AUTH DEBUG: Google OAuth failed: {auth_result.get('error')}")
            return create_response(401, {
                'error': auth_result['error'],
                'authenticated': False
            })
    
    return create_response(400, {
        'error': 'Either (extension and passcode) or google_access_token is required for authentication'
    })

def handle_admin_delete(body):
    """Handle admin deletion of tenant (only root tenant can do this)"""
    admin_tenant = body.get('admin_tenant')
    admin_passcode = body.get('admin_passcode')
    target_tenant = body.get('target_tenant')
    
    if not admin_tenant or not admin_passcode or not target_tenant:
        return create_response(400, {'error': 'admin_tenant, admin_passcode, and target_tenant are required'})
    
    # Verify admin is root tenant
    if admin_tenant != 'root':
        return create_response(403, {'error': 'Only root tenant can delete other tenants'})
    
    # Verify admin passcode
    if not verify_passcode(admin_tenant, admin_passcode):
        return create_response(401, {'error': 'Admin authentication failed'})
    
    try:
        # Delete all S3 objects for the tenant
        s3_objects = s3.list_objects_v2(
            Bucket=bucket_name,
            Prefix=f"schemas/{target_tenant}/"
        )
        
        deleted_s3_count = 0
        if 'Contents' in s3_objects:
            for obj in s3_objects['Contents']:
                s3.delete_object(Bucket=bucket_name, Key=obj['Key'])
                deleted_s3_count += 1
        
        # Delete all DynamoDB entries for the tenant
        deleted_dynamo_count = 0
        
        # Delete tenant entry
        try:
            table.delete_item(
                Key={
                    'tenantId': target_tenant,
                    'type': 'tenant'
                }
            )
            deleted_dynamo_count += 1
        except Exception as e:
            print(f"Error deleting tenant entry: {str(e)}")
        
        # Delete all dependent users for this tenant
        scan_response = table.scan(
            FilterExpression='#tenantId = :tenantId AND #type = :userType',
            ExpressionAttributeNames={
                '#tenantId': 'tenantId',
                '#type': 'type'
            },
            ExpressionAttributeValues={
                ':tenantId': target_tenant,
                ':userType': 'user'
            }
        )
        
        for item in scan_response.get('Items', []):
            try:
                table.delete_item(
                    Key={
                        'tenantId': item['tenantId'],
                        'type': item['type']
                    }
                )
                deleted_dynamo_count += 1
            except Exception as e:
                print(f"Error deleting user entry: {str(e)}")
        
        return create_response(200, {
            'message': f'Tenant {target_tenant} deleted successfully',
            'deleted_s3_objects': deleted_s3_count,
            'deleted_dynamo_entries': deleted_dynamo_count
        })
        
    except Exception as e:
        print(f"Error deleting tenant: {str(e)}")
        return create_response(500, {'error': 'Failed to delete tenant'})

def handle_create_user(body):
    """Handle creation of dependent users"""
    tenant_id = body.get('extension')
    passcode = body.get('passcode')
    user_id = body.get('user_id')
    user_passcode = body.get('user_passcode')
    
    if not tenant_id or not passcode or not user_id or not user_passcode:
        return create_response(400, {'error': 'extension, passcode, user_id, and user_passcode are required'})
    
    # Verify tenant exists and passcode is correct
    if not verify_passcode(tenant_id, passcode):
        return create_response(401, {'error': 'Tenant authentication failed'})
    
    # Generate unique salt and hash for the user
    salt = generate_salt()
    hashed_user_passcode = hash_passcode(user_passcode, salt)
    
    try:
        # Store user in DynamoDB
        table.put_item(
            Item={
                'tenantId': user_id,
                'type': 'user',
                'parent_tenant': tenant_id,
                'passcode': hashed_user_passcode,
                'salt': salt,
                'created_at': datetime.utcnow().isoformat()
            },
            ConditionExpression='attribute_not_exists(tenantId) AND attribute_not_exists(#type)',
            ExpressionAttributeNames={
                '#type': 'type'
            }
        )
        
        return create_response(200, {
            'message': 'User created successfully',
            'userId': user_id,
            'parentTenant': tenant_id
        })
        
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return create_response(409, {'error': 'User already exists'})
    except Exception as e:
        print(f"Error creating user: {str(e)}")
        return create_response(500, {'error': 'Failed to create user'})

def handle_manage_oauth_scopes(body, context=None):
    """Handle OAuth scope management for tenants using Google OAuth tokens"""
    tenant_id = body.get('extension')
    target_user_email = body.get('user_email')  # The email being managed (target user)
    scopes = body.get('scopes', [])  # ['read', 'write', 'admin']
    action = body.get('action', 'set')  # 'set', 'get', or 'remove'
    
    # Get the authorization header from the event context
    auth_header = None
    if context and 'headers' in context:
        auth_header = context['headers'].get('Authorization') or context['headers'].get('authorization')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        return create_response(401, {'error': 'Bearer token required in Authorization header'})
    
    access_token = auth_header.replace('Bearer ', '')
    
    if not tenant_id or not target_user_email:
        return create_response(400, {'error': 'extension and user_email are required'})
    
    # Verify the requesting user has admin access to this tenant
    auth_result = verify_google_token_and_permissions(access_token, tenant_id)
    if not auth_result['valid']:
        return create_response(401, {'error': f'Authentication failed: {auth_result["error"]}'})
    
    permissions = auth_result['permissions']
    if not permissions.get('admin', False):
        return create_response(403, {'error': 'Admin permission required to manage user scopes'})
    
    # Validate scopes for set action
    if action == 'set':
        valid_scopes = ['read', 'write', 'admin']
        for scope in scopes:
            if scope not in valid_scopes:
                return create_response(400, {'error': f'Invalid scope: {scope}. Valid scopes: {valid_scopes}'})
    
    try:
        if action == 'set':
            # Convert scopes array to permissions object
            permissions = {
                'read': 'read' in scopes,
                'write': 'write' in scopes,
                'admin': 'admin' in scopes
            }
            
            # Update the frontend-users table with admin permissions
            admin_item_data = {
                'tenantId': tenant_id,
                'type': 'admin',
                'user_email': target_user_email,
                'permissions': permissions,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat(),
                'managed_by': auth_result['user_email']
            }
            
            table.put_item(Item=admin_item_data)
            
            # Also update the oauth_scopes table for backward compatibility
            target_sort_key = f'oauth_scopes#{target_user_email}'
            oauth_item_data = {
                'tenantId': tenant_id,
                'type': target_sort_key,
                'user_email': target_user_email,
                'scopes': scopes,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat(),
                'managed_by': auth_result['user_email']
            }
            
            table.put_item(Item=oauth_item_data)
            
            return create_response(200, {
                'message': f'OAuth scopes set successfully for user {target_user_email}',
                'target_user_email': target_user_email,
                'tenant_id': tenant_id,
                'scopes': scopes,
                'permissions': permissions,
                'managed_by': auth_result['user_email']
            })
            
        elif action == 'get':
            # Get permissions from frontend-users table for the target user
            try:
                # Look for the user's permissions in the frontend-users table
                response = table.get_item(
                    Key={
                        'tenantId': tenant_id,
                        'type': 'admin'
                    }
                )
                item = response.get('Item')
                
                if item and item.get('user_email') == target_user_email:
                    # Extract permissions from the permissions object
                    permissions_obj = item.get('permissions', {})
                    permissions = {
                        'read': permissions_obj.get('read', {}).get('BOOL', False) if isinstance(permissions_obj.get('read'), dict) else permissions_obj.get('read', False),
                        'write': permissions_obj.get('write', {}).get('BOOL', False) if isinstance(permissions_obj.get('write'), dict) else permissions_obj.get('write', False),
                        'admin': permissions_obj.get('admin', {}).get('BOOL', False) if isinstance(permissions_obj.get('admin'), dict) else permissions_obj.get('admin', False)
                    }
                    
                    # Convert to scopes array
                    scopes = []
                    if permissions.get('read', False):
                        scopes.append('read')
                    if permissions.get('write', False):
                        scopes.append('write')
                    if permissions.get('admin', False):
                        scopes.append('admin')
                    
                    return create_response(200, {
                        'message': 'Lookup successful',
                        'tenant_id': tenant_id,
                        'user_email': target_user_email,
                        'scopes': scopes,
                        'permissions': permissions
                    })
                else:
                    # User not found in admin table, check oauth_scopes table as fallback
                    target_sort_key = f'oauth_scopes#{target_user_email}'
                    response = table.get_item(
                        Key={
                            'tenantId': tenant_id,
                            'type': target_sort_key
                        }
                    )
                    item = response.get('Item')
                    scopes = item.get('scopes', []) if item else []
                    # Ensure scopes are returned as list not set
                    if isinstance(scopes, set):
                        scopes = list(scopes)
                    
                    return create_response(200, {
                        'message': 'Lookup successful',
                        'tenant_id': tenant_id,
                        'user_email': target_user_email,
                        'scopes': scopes
                    })
            except Exception as e:
                print(f"Error getting user scopes: {str(e)}")
                return create_response(200, {
                    'message': 'Lookup successful (not found)',
                    'tenant_id': tenant_id,
                    'user_email': target_user_email,
                    'scopes': []
                })
                
        elif action == 'remove':
            # Delete the specific record for this email
            target_sort_key = f'oauth_scopes#{target_user_email}'
            try:
                table.delete_item(
                    Key={
                        'tenantId': tenant_id,
                        'type': target_sort_key
                    }
                )
                return create_response(200, {
                    'message': f'OAuth scopes removed for user {target_user_email}',
                    'tenant_id': tenant_id,
                    'user_email': target_user_email
                })
            except Exception as e:
                print(f"Error removing user scopes: {str(e)}")
                return create_response(500, {'error': 'Failed to remove user scopes'})
        else:
            return create_response(400, {'error': 'Invalid action. Use "set" or "remove"'})
            
    except Exception as e:
        print(f"Error managing OAuth scopes: {str(e)}")
        return create_response(500, {'error': 'Failed to manage OAuth scopes'})

def handle_oauth_token_exchange(body):
    """Handle OAuth authorization code exchange for access token"""
    auth_code = body.get('code')
    redirect_uri = body.get('redirect_uri')
    
    if not auth_code or not redirect_uri:
        return create_response(400, {'error': 'code and redirect_uri are required'})
    
    if not google_client_id or not google_client_secret:
        return create_response(500, {'error': 'Google OAuth not configured'})
    
    try:
        # Exchange authorization code for access token
        token_data = {
            'code': auth_code,
            'client_id': google_client_id,
            'client_secret': google_client_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code'
        }
        
        # Convert to URL-encoded format
        token_payload = urllib.parse.urlencode(token_data).encode('utf-8')
        
        # Make request to Google's token endpoint
        req = urllib.request.Request(
            'https://oauth2.googleapis.com/token',
            data=token_payload,
            headers={
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            method='POST'
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status != 200:
                error_body = response.read().decode()
                return create_response(400, {'error': f'Token exchange failed: {error_body}'})
            
            token_response = json.loads(response.read().decode())
            
            # Get user info with the access token
            access_token = token_response.get('access_token')
            if access_token:
                user_info_req = urllib.request.Request(
                    'https://www.googleapis.com/oauth2/v2/userinfo',
                    headers={'Authorization': f'Bearer {access_token}'}
                )
                
                with urllib.request.urlopen(user_info_req, timeout=10) as user_response:
                    if user_response.status == 200:
                        user_info = json.loads(user_response.read().decode())
                        token_response['user_info'] = user_info
            
            return create_response(200, token_response)
            
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else "Unknown error"
        return create_response(400, {'error': f'OAuth token exchange failed: {error_body}'})
    except urllib.error.URLError as e:
        return create_response(500, {'error': f'Network error during token exchange: {str(e)}'})
    except Exception as e:
        print(f"Error in OAuth token exchange: {str(e)}")
        return create_response(500, {'error': 'Failed to exchange OAuth token'})


def handle_stripe_webhook(body, event):
    """Handle Stripe webhook events"""
    try:
        # Verify webhook signature
        headers = event.get('headers', {})
        signature = headers.get('stripe-signature')
        
        if not signature or not stripe_webhook_secret:
            return create_response(400, {'error': 'Missing webhook signature or secret'})
        
        # Verify the webhook signature
        try:
            stripe.Webhook.construct_event(
                json.dumps(body),
                signature,
                stripe_webhook_secret
            )
        except ValueError:
            return create_response(400, {'error': 'Invalid payload'})
        except stripe.error.SignatureVerificationError:
            return create_response(400, {'error': 'Invalid signature'})
        
        # Handle different event types
        event_type = body.get('type')
        
        if event_type == 'checkout.session.completed':
            return handle_checkout_completed(body)
        elif event_type == 'customer.created':
            return handle_customer_created(body)
        else:
            return create_response(200, {'message': f'Unhandled event type: {event_type}'})
            
    except Exception as e:
        print(f"Error handling webhook: {str(e)}")
        return create_response(500, {'error': 'Failed to process webhook'})


def handle_checkout_completed(event_data):
    """Handle successful checkout completion"""
    try:
        session = event_data['data']['object']
        customer_id = session.get('customer')
        
        # Get customer email from session
        customer_email = session.get('customer_details', {}).get('email')
        if not customer_email:
            return create_response(400, {'error': 'No customer email found'})
        
        # Get tenant from client_reference_id (for tracking which tenant initiated the purchase)
        tenant = session.get('client_reference_id', 'default')
        
        # Find the billing administrator by email
        try:
            billing_response = billing_table.get_item(
                Key={'user_email': customer_email}
            )
            
            if 'Item' in billing_response:
                # Update existing billing administrator with Stripe customer ID
                billing_admin = billing_response['Item']
                billing_table.update_item(
                    Key={'user_email': customer_email},
                    UpdateExpression='SET stripe_customer_id = :customer_id, last_purchase = :timestamp',
                    ExpressionAttributeValues={
                        ':customer_id': customer_id,
                        ':timestamp': datetime.utcnow().isoformat()
                    }
                )
                print(f"Updated billing admin {customer_email} with Stripe customer {customer_id}")
            else:
                # Create new billing administrator (this shouldn't happen in normal flow)
                print(f"Warning: No billing admin found for email {customer_email}, creating new one")
                # We can't create a billing admin without a Google user ID, so just log this
                
        except Exception as e:
            print(f"Error updating billing administrator: {str(e)}")
            # Fallback: create in old structure for backward compatibility
            admin_user = {
                'tenantId': tenant,
                'type': 'user',
                'user_email': customer_email,
                'stripe_customer_id': customer_id,
                'scopes': ['admin'],
                'createdAt': datetime.utcnow().isoformat()
            }
            table.put_item(Item=admin_user)
        
        return create_response(200, {'message': 'Checkout completed successfully'})
        
    except Exception as e:
        print(f"Error handling checkout completion: {str(e)}")
        return create_response(500, {'error': 'Failed to process checkout completion'})


def handle_customer_created(event_data):
    """Handle customer creation"""
    try:
        customer = event_data['data']['object']
        customer_id = customer.get('id')
        customer_email = customer.get('email')
        
        if not customer_email:
            return create_response(400, {'error': 'No customer email found'})
        
        # Find billing administrator by customer email
        try:
            billing_response = billing_table.get_item(
                Key={'user_email': customer_email}
            )
            
            if 'Item' in billing_response:
                # Update existing billing administrator with Stripe customer ID
                billing_admin = billing_response['Item']
                billing_table.update_item(
                    Key={'user_email': customer_email},
                    UpdateExpression='SET stripe_customer_id = :customer_id',
                    ExpressionAttributeValues={':customer_id': customer_id}
                )
                print(f"Updated billing admin {customer_email} with Stripe customer {customer_id}")
            else:
                print(f"Warning: No billing admin found for email {customer_email}")
                
        except Exception as e:
            print(f"Error updating billing administrator: {str(e)}")
            # Fallback: update old structure for backward compatibility
            response = table.query(
                IndexName='UserEmailIndex',
                KeyConditionExpression='user_email = :email',
                ExpressionAttributeValues={':email': customer_email}
            )
            
            if response['Items']:
                for item in response['Items']:
                    table.update_item(
                        Key={'tenantId': item['tenantId'], 'type': item['type']},
                        UpdateExpression='SET stripe_customer_id = :cid',
                        ExpressionAttributeValues={':cid': customer_id}
                    )
        
        return create_response(200, {'message': 'Customer created successfully'})
        
    except Exception as e:
        print(f"Error handling customer creation: {str(e)}")
        return create_response(500, {'error': 'Failed to process customer creation'})


# REMOVED: handle_check_permissions function - billing permission now handled in handle_auth


def handle_create_account_link(body):
    """Handle creating Stripe account link for onboarding"""
    try:
        user_email = body.get('user_email')
        tenant_id = body.get('extension')
        
        if not user_email or not tenant_id:
            return create_response(400, {'error': 'user_email and extension are required'})
        
        # Get the user's Stripe account ID
        response = billing_table.get_item(
            Key={'user_email': user_email}
        )
        
        if 'Item' not in response:
            return create_response(404, {'error': 'User not found in billing system'})
        
        billing_admin = response['Item']
        stripe_account_id = billing_admin.get('stripe_account_id')
        
        if not stripe_account_id:
            return create_response(404, {'error': 'No Stripe account found for user'})
        
        # Create account link
        return_url = f"https://blockforger.zanzalaz.com/stripe.html?account_id={stripe_account_id}&tenant={tenant_id}"
        refresh_url = f"https://blockforger.zanzalaz.com/billing.html?tenant={tenant_id}"
        
        account_link = create_stripe_account_link(stripe_account_id, return_url, refresh_url)
        
        if not account_link:
            return create_response(500, {'error': 'Failed to create account link'})
        
        return create_response(200, {
            'message': 'Account link created successfully',
            'account_link_url': account_link['url'],
            'account_id': stripe_account_id
        })
        
    except Exception as e:
        print(f"Error creating account link: {str(e)}")
        return create_response(500, {'error': 'Failed to create account link'})

def handle_check_account_status(body):
    """Handle checking Stripe account status and user token balance"""
    try:
        account_id = body.get('account_id')
        user_email = body.get('user_email')
        tenant_id = body.get('extension')
        
        # If user_email is provided, get token balance from billing table
        if user_email:
            try:
                response = billing_table.get_item(
                    Key={'user_email': user_email}
                )
                
                if 'Item' in response:
                    billing_data = response['Item']
                    token_balance = int(math.floor(float(billing_data.get('token_balance', 0))))
                    total_tokens_purchased = int(math.floor(float(billing_data.get('total_tokens_purchased', 0))))
                    last_payment_date = int(math.floor(float(billing_data.get('last_payment_date', 0))))
                    last_payment_amount = int(math.floor(float(billing_data.get('last_payment_amount', 0))))
                    stripe_account_id = billing_data.get('stripe_account_id', '')
                    
                    return create_response(200, {
                        'message': 'User account status retrieved successfully',
                        'user_email': user_email,
                        'token_balance': token_balance,
                        'total_tokens_purchased': total_tokens_purchased,
                        'last_payment_date': last_payment_date,
                        'last_payment_amount': last_payment_amount,
                        'stripe_account_id': stripe_account_id
                    })
                else:
                    return create_response(404, {
                        'message': 'User not found in billing system',
                        'user_email': user_email,
                        'token_balance': 0
                    })
                    
            except Exception as e:
                print(f"Error getting user billing data: {str(e)}")
                return create_response(500, {'error': 'Failed to get user billing data'})
        
        # If account_id is provided, check Stripe account status
        elif account_id:
            if not stripe_secret_key:
                return create_response(500, {'error': 'Stripe not configured'})
            
            # Retrieve account details from Stripe
            account = stripe.Account.retrieve(account_id)
            
            # Check if account is ready to accept payments
            charges_enabled = account.get('charges_enabled', False)
            details_submitted = account.get('details_submitted', False)
            
            # Update billing admin with account status
            try:
                billing_table.update_item(
                    Key={'stripe_account_id': account_id},
                    UpdateExpression='SET account_status = :status, charges_enabled = :charges, last_activity = :activity',
                    ExpressionAttributeValues={
                        ':status': 'active' if charges_enabled else 'pending',
                        ':charges': charges_enabled,
                        ':activity': datetime.utcnow().isoformat()
                    }
                )
            except Exception as e:
                print(f"Error updating billing admin status: {str(e)}")
            
            return create_response(200, {
                'message': 'Account status retrieved successfully',
                'account_id': account_id,
                'charges_enabled': charges_enabled,
                'details_submitted': details_submitted,
                'status': 'active' if charges_enabled else 'pending'
            })
        else:
            return create_response(400, {'error': 'Either account_id or user_email is required'})
        
    except Exception as e:
        print(f"Error checking account status: {str(e)}")
        return create_response(500, {'error': 'Failed to check account status'})

def handle_debit_tokens(body):
    """Handle token debiting for pageloads and API calls"""
    try:
        tenant_id = body.get('extension')
        tokens_to_debit = body.get('tokens', 1)  # Default to 1 token
        operation_type = body.get('operation_type', 'pageload')  # pageload, llm-preload, llm-generate, etc.
        
        if not tenant_id:
            return create_response(400, {'error': 'extension (tenant_id) is required'})
        
        if not isinstance(tokens_to_debit, int) or tokens_to_debit < 0:
            return create_response(400, {'error': 'tokens must be a non-negative integer'})
        
        print(f"Debiting {tokens_to_debit} tokens for tenant {tenant_id}, operation: {operation_type}")
        
        # Find the billing user for this tenant
        billing_user_email = get_billing_user_for_tenant(tenant_id)
        
        if not billing_user_email:
            print(f"No billing user found for tenant {tenant_id} - allowing operation to proceed")
            return create_response(200, {
                'message': 'No billing account found - operation allowed',
                'tenant_id': tenant_id,
                'tokens_debited': 0,
                'operation_type': operation_type,
                'payment_enforced': payment_enforced
            })
        
        # ALWAYS debit tokens when a billing user is found, regardless of enforcement
        success = debit_tokens_from_user(billing_user_email, tokens_to_debit, operation_type)
        
        if success:
            return create_response(200, {
                'message': 'Tokens debited successfully',
                'tenant_id': tenant_id,
                'billing_user_email': billing_user_email,
                'tokens_debited': tokens_to_debit,
                'operation_type': operation_type,
                'payment_enforced': payment_enforced
            })
        else:
            # Even if debiting fails, we don't return 402 unless enforcement is enabled
            # This allows operations to continue even with billing issues
            return create_response(200, {
                'message': 'Token debit failed but operation allowed',
                'tenant_id': tenant_id,
                'billing_user_email': billing_user_email,
                'tokens_debited': 0,
                'operation_type': operation_type,
                'payment_enforced': payment_enforced,
                'warning': 'Billing system error - tokens not debited'
            })
            
    except Exception as e:
        print(f"Error in token debiting: {str(e)}")
        return create_response(500, {'error': 'Failed to process token debit request'})

def get_billing_user_for_tenant(tenant_id):
    """Get the billing user email for a given tenant"""
    try:
        # First try the new mapping table
        response = billing_user_from_tenant_table.query(
            KeyConditionExpression='tenant_id = :tenant_id',
            ExpressionAttributeValues={':tenant_id': tenant_id},
            Limit=1
        )
        
        if response['Items']:
            return response['Items'][0]['user_email']
        
        # Fallback: scan the billing-admins table for managed_tenants list
        response = billing_table.scan(
            FilterExpression='contains(managed_tenants, :tenant_id)',
            ExpressionAttributeValues={':tenant_id': tenant_id}
        )
        
        if response['Items']:
            billing_admin = response['Items'][0]
            user_email = billing_admin['user_email']
            
            # Add to the new mapping table for future efficiency
            try:
                billing_user_from_tenant_table.put_item(
                    Item={
                        'tenant_id': tenant_id,
                        'user_email': user_email,
                        'created_at': datetime.utcnow().isoformat(),
                        'source': 'migrated_from_managed_tenants'
                    }
                )
                print(f"Added mapping: {tenant_id} -> {user_email}")
            except Exception as e:
                print(f"Error adding mapping to new table: {str(e)}")
            
            return user_email
        
        return None
        
    except Exception as e:
        print(f"Error getting billing user for tenant {tenant_id}: {str(e)}")
        return None

def debit_tokens_from_user(user_email, tokens_to_debit, operation_type):
    """Debit tokens from a user's account (allows negative balance)"""
    try:
        # Update the token balance (allow negative values)
        response = billing_table.update_item(
            Key={'user_email': user_email},
            UpdateExpression='SET token_balance = if_not_exists(token_balance, :zero) - :tokens, last_activity = :activity',
            ExpressionAttributeValues={
                ':tokens': Decimal(str(tokens_to_debit)),
                ':zero': Decimal('0'),
                ':activity': datetime.utcnow().isoformat()
            },
            ReturnValues='UPDATED_NEW'
        )
        
        new_balance = int(response['Attributes']['token_balance'])
        print(f"Debited {tokens_to_debit} tokens from {user_email} for {operation_type}. New balance: {new_balance}")
        
        return True
        
    except Exception as e:
        print(f"Error debiting tokens from user {user_email}: {str(e)}")
        return False

def handle_bill(body):
    """Handle daily storage billing process"""
    try:
        print("Starting daily storage billing process...")
        
        # Get all tenants with Stripe customer IDs
        response = table.scan(
            FilterExpression='attribute_exists(stripe_customer_id)'
        )
        
        # Process each tenant
        for item in response['Items']:
            tenant_id = item['tenantId']
            customer_id = item.get('stripe_customer_id')
            
            if not customer_id:
                continue
                
            print(f"Processing storage billing for tenant: {tenant_id}")
            
            # Calculate storage usage
            storage_usage_mb = calculate_storage_usage(tenant_id)
            print(f"Storage usage for {tenant_id}: {storage_usage_mb} MB")
            
            # Calculate tokens to debit (1 token per 10MB)
            storage_tokens = max(1, storage_usage_mb // 10)
            
            # Send meter event to Stripe
            if storage_tokens > 0:
                success = send_stripe_meter_event(customer_id, storage_tokens)
                if success:
                    print(f"Sent {storage_tokens} storage tokens to Stripe for tenant {tenant_id}")
                else:
                    print(f"Failed to send storage tokens to Stripe for tenant {tenant_id}")
        
        print("Daily storage billing process completed")
        return create_response(200, {'message': 'Daily storage billing completed successfully'})
        
    except Exception as e:
        print(f"Error in daily storage billing: {str(e)}")
        return create_response(500, {'error': 'Failed to process daily storage billing'})


def calculate_storage_usage(tenant_id):
    """Calculate storage usage in MB for a tenant"""
    try:
        # List all objects in the tenant's schema folder
        prefix = f"schemas/{tenant_id}/"
        
        total_size = 0
        paginator = s3.get_paginator('list_objects_v2')
        
        for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    total_size += obj['Size']
        
        # Convert to MB and round up
        size_mb = (total_size / (1024 * 1024))
        return int(size_mb) + (1 if size_mb % 1 > 0 else 0)
        
    except Exception as e:
        print(f"Error calculating storage usage for {tenant_id}: {str(e)}")
        return 0




def send_stripe_meter_event(customer_id, value):
    """Send meter event to Stripe"""
    try:
        import requests
        
        url = 'https://api.stripe.com/v1/billing/meter_events'
        headers = {
            'Authorization': f'Bearer {stripe_secret_key}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        data = {
            'event_name': 'pageload_tokens',
            'timestamp': int(datetime.utcnow().timestamp()),
            'payload[stripe_customer_id]': customer_id,
            'payload[value]': value
        }
        
        response = requests.post(url, headers=headers, data=data, timeout=10)
        
        if response.status_code == 200:
            print(f"Successfully sent meter event: {value} tokens for customer {customer_id}")
            return True
        else:
            print(f"Failed to send meter event: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"Error sending Stripe meter event: {str(e)}")
        return False
