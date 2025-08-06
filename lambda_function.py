import json
import boto3
import os
from datetime import datetime, timedelta
import hashlib
import hmac
import base64
import secrets
import string

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table = dynamodb.Table('frontend-users')
bucket_name = os.environ['BUCKET_NAME']

def lambda_handler(event, context):
    """Main Lambda handler for JSON Block Builder API"""
    try:
        # Check if this is an authorizer request
        if 'type' in event and event['type'] == 'TOKEN':
            return handle_authorizer(event)
        
        # Parse the request body
        if isinstance(event['body'], str):
            body = json.loads(event['body'])
        else:
            body = event['body']
        
        request_type = body.get('type')
        extension = body.get('extension')
        
        # Validate required fields
        if not extension:
            return create_response(400, {'error': 'extension is required'})
        
        if not request_type:
            return create_response(400, {'error': 'type is required'})
        
        # Route to appropriate handler
        if request_type == 'register':
            return handle_register(body)
        elif request_type == 'del':
            return handle_delete(body)
        elif request_type == 'json':
            return handle_json(body)
        elif request_type == 'llm':
            return handle_llm(body)
        elif request_type == 'auth':
            return handle_auth(body)
        elif request_type == 'admin_delete':
            return handle_admin_delete(body)
        elif request_type == 'create_user':
            return handle_create_user(body)
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
    """Create a standardized API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        'body': json.dumps(body)
    }

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
    """Handle tenant registration"""
    passcode = body.get('passcode')
    if not passcode:
        return create_response(400, {'error': 'passcode is required for register'})
    
    # Generate unique salt and hash the passcode
    salt = generate_salt()
    hashed_passcode = hash_passcode(passcode, salt)
    
    try:
        # Store in DynamoDB
        table.put_item(
            Item={
                'tenantId': body['extension'],
                'type': 'tenant',
                'passcode': hashed_passcode,
                'salt': salt,
                'created_at': datetime.utcnow().isoformat()
            },
            ConditionExpression='attribute_not_exists(tenantId) AND attribute_not_exists(#type)',
            ExpressionAttributeNames={
                '#type': 'type'
            }
        )
        
        return create_response(200, {
            'message': 'Tenant registered successfully',
            'tenantId': body['extension']
        })
        
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return create_response(409, {'error': 'Tenant already exists'})
    except Exception as e:
        print(f"Error registering tenant: {str(e)}")
        return create_response(500, {'error': 'Failed to register tenant'})

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

def handle_json(body):
    """Handle JSON schema upload"""
    schema_list = body.get('schema', [])
    
    if not schema_list:
        return create_response(400, {'error': 'schema list is required for json operation'})
    
    uploaded_schemas = []
    failed_schemas = []
    
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
    
    response_body = {
        'message': f'Uploaded {len(uploaded_schemas)} schemas',
        'uploaded_schemas': uploaded_schemas
    }
    
    if failed_schemas:
        response_body['failed_schemas'] = failed_schemas
    
    return create_response(200, response_body)

def handle_llm(body):
    """Handle LLM schema generation (placeholder for future implementation)"""
    schema_definitions = body.get('schema', [])
    
    if not schema_definitions:
        return create_response(400, {'error': 'schema list is required for llm operation'})
    
    # Placeholder implementation - in the future this would call an actual LLM API
    # For now, return an error indicating LLM is not yet implemented
    return create_response(501, {
        'error': 'LLM schema generation is not yet implemented',
        'message': 'This feature will be available in a future release. Please use the "json" type to upload schemas directly.',
        'supported_types': ['register', 'del', 'json']
    })

def handle_auth(body):
    """Handle authentication"""
    tenant_id = body.get('extension')
    passcode = body.get('passcode')
    
    if not tenant_id or not passcode:
        return create_response(400, {'error': 'extension and passcode are required for authentication'})
    
    # Verify the passcode
    if verify_passcode(tenant_id, passcode):
        return create_response(200, {
            'message': 'Authentication successful',
            'tenantId': tenant_id,
            'authenticated': True
        })
    else:
        return create_response(401, {
            'error': 'Authentication failed',
            'authenticated': False
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
