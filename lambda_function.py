import json
import boto3
import os
from datetime import datetime, timedelta
import hashlib
import hmac
import base64

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table = dynamodb.Table('frontend-users')
bucket_name = os.environ['BUCKET_NAME']

def lambda_handler(event, context):
    """Main Lambda handler for JSON Block Builder API"""
    try:
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
        else:
            return create_response(400, {'error': f'Invalid request type: {request_type}'})
            
    except json.JSONDecodeError:
        return create_response(400, {'error': 'Invalid JSON in request body'})
    except Exception as e:
        print(f"Error: {str(e)}")
        return create_response(500, {'error': 'Internal server error'})

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

def hash_passcode(passcode):
    """Hash a passcode using HMAC-SHA256 with a salt"""
    salt = os.environ.get('SALT', 'default-salt-change-in-production')
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
        response = table.get_item(
            Key={
                'tenantId': tenant_id,
                'passcode': hash_passcode(passcode)
            }
        )
        return 'Item' in response
    except Exception as e:
        print(f"Error verifying passcode: {str(e)}")
        return False

def handle_register(body):
    """Handle tenant registration"""
    passcode = body.get('passcode')
    if not passcode:
        return create_response(400, {'error': 'passcode is required for register'})
    
    # Hash the passcode
    hashed_passcode = hash_passcode(passcode)
    
    try:
        # Store in DynamoDB
        table.put_item(
            Item={
                'tenantId': body['extension'],
                'passcode': hashed_passcode,
                'created_at': datetime.utcnow().isoformat(),
                'ttl': int((datetime.utcnow() + timedelta(days=365)).timestamp())
            },
            ConditionExpression='attribute_not_exists(tenantId) AND attribute_not_exists(passcode)'
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
                filename = f"{title}.json" if title[:-5] != '.json' else title
            
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