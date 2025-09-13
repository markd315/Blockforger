import json
import boto3
import os
from datetime import datetime, timedelta
import hashlib
import hmac
import base64
import secrets
import string
import urllib.request
import urllib.parse
import urllib.error

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table = dynamodb.Table('frontend-users')
bucket_name = os.environ['BUCKET_NAME']
openai_api_key = os.environ.get('OPENAI_API_KEY')

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
        
        request_type = event.get('type')
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
        elif request_type == 'llm-preload':
            return handle_llm_preload(body)
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
            'Access-Control-Allow-Origin': '*'
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
    """Handle LLM schema generation using OpenAI"""
    schema_definitions = body.get('schema', [])
    
    if not schema_definitions:
        return create_response(400, {'error': 'schema list is required for llm operation'})
    
    if not openai_api_key:
        return create_response(500, {'error': 'OpenAI API key not configured'})
    
    try:
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
    import jsonschema
    from jsonschema import validate, ValidationError
    
    # Create context string with all schemas
    schema_context = "Available schemas for this tenant:\n\n"
    for schema_info in schemas:
        schema_context += f"Schema ID: {schema_info['id']}\n"
        schema_context += f"Title: {schema_info['schema'].get('title', 'N/A')}\n"
        schema_context += f"Description: {schema_info['schema'].get('description', 'N/A')}\n"
        schema_context += f"Properties: {json.dumps(schema_info['schema'].get('properties', {}), indent=2)}\n"
        schema_context += f"Required fields: {schema_info['schema'].get('required', [])}\n\n"
    
    system_prompt = f"""You are a JSON object generator. You will be given a list of JSON schemas and a user prompt describing what object to create.

{schema_context}

Your task:
1. Analyze the user prompt and determine which schema it best matches
2. Generate a JSON object that complies EXACTLY with that schema
3. Include ALL required fields from the schema
4. Use appropriate values that match the user's description
5. Return ONLY the JSON object, no explanations

Requirements:
- The JSON object must be valid JSON
- It must include all required fields from the chosen schema
- Field values should match the user's description
- Use appropriate data types (string, number, boolean, array, object)
- For arrays, include at least one item if the user describes multiple items
- For objects with $ref, create a simple object with the referenced properties

Return format:
{{
  "detected_schema": "schema_id_here",
  "json_object": {{
    // The actual JSON object that complies with the schema
  }}
}}"""

    user_prompt_text = f"User request: {user_prompt}"
    
    max_attempts = 3
    attempts = 0
    
    while attempts < max_attempts:
        attempts += 1
        
        try:
            # Generate JSON object using OpenAI
            generated_response = call_openai_api(system_prompt, user_prompt_text)
            
            # Parse the response
            response_data = json.loads(generated_response)
            detected_schema_id = response_data.get('detected_schema')
            json_object = response_data.get('json_object')
            
            if not detected_schema_id or not json_object:
                raise Exception("Invalid response format from OpenAI")
            
            # Find the matching schema
            matching_schema = None
            for schema_info in schemas:
                if schema_info['id'] == detected_schema_id or schema_info['filename'] == detected_schema_id:
                    matching_schema = schema_info['schema']
                    break
            
            if not matching_schema:
                raise Exception(f"Schema {detected_schema_id} not found in available schemas")
            
            # Validate the JSON object against the schema
            try:
                validate(instance=json_object, schema=matching_schema)
                
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
      "description": "List of flight routes (minimum 1 required)",
      "type": "array",
      "items": {
        "$ref": "flightRoute.json"
      },
      "minItems": 1
    },
    "brandLink": {
      "description": "Brand link/URL",
      "type": "string"
    },
    "hub": {
      "description": "Primary hub airport",
      "$ref": "airport.json"
    }
  },
  "required": ["hub"]
}"""

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
