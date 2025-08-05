# JSON Block Builder - Multitenant Cloud Infrastructure

This project has been refactored to support a multitenant cloud strategy using AWS services including Lambda, API Gateway, DynamoDB, S3, and EC2.

## Architecture Overview

### Components

1. **Lambda Function** (`lambda_function.py`)
   - Handles tenant registration, schema deletion, and JSON schema upload
   - Uses DynamoDB for user management with bcrypt hashing
   - Manages S3 bucket operations for schemas

2. **API Gateway**
   - Provides REST API endpoint for Lambda function
   - Handles CORS and request routing

3. **DynamoDB Table** (`frontend-users`)
   - Stores tenant information with passcode hashing
   - Uses tenantId as partition key, passcode as sort key

4. **S3 Bucket** (`universal-frontend-{account}-{env}`)
   - Stores schemas organized by tenant: `schemas/{tenantId}/`
   - Supports versioning and CORS

5. **EC2 Instance** (t2.micro)
   - Runs the JavaScript application
   - Uses EIP "frontend2" for static IP
   - Configured with IAM role for S3 read access

## Deployment

### Prerequisites

1. **AWS CLI** installed and configured
2. **EC2 Key Pair** created in us-east-1
3. **jq** installed for JSON parsing (optional, for deployment script)

### Quick Deployment

```bash
# Make deployment script executable
chmod +x deploy.sh

# Deploy with your EC2 key pair name
./deploy.sh your-key-pair-name
```

### Manual Deployment

```bash
# Deploy CloudFormation stack
aws cloudformation deploy \
    --template-file cloudformation-template.yaml \
    --stack-name json-blockbuilder-multitenant \
    --parameter-overrides Environment=dev EC2KeyName=your-key-pair-name \
    --capabilities CAPABILITY_NAMED_IAM \
    --region us-east-1
```

## API Usage

### Register a Tenant

```bash
curl -X POST https://{api-id}.execute-api.us-east-1.amazonaws.com/dev/api \
    -H "Content-Type: application/json" \
    -d '{
        "type": "register",
        "extension": "airline",
        "passcode": "secure-passcode-123"
    }'
```

### Upload JSON Schemas

```bash
curl -X POST https://{api-id}.execute-api.us-east-1.amazonaws.com/dev/api \
    -H "Content-Type: application/json" \
    -d '{
        "type": "json",
        "extension": "airline",
        "schema": [
            "{\"$schema\":\"https://json-schema.org/draft/2019-09/schema\",\"$id\":\"customer.json\",\"title\":\"Customer\",\"description\":\"A customer object\",\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Customer name\"},\"email\":{\"type\":\"string\",\"format\":\"email\",\"description\":\"Customer email\"}},\"required\":[\"name\",\"email\"]}"
        ]
    }'
```

### Delete Schemas

```bash
curl -X POST https://{api-id}.execute-api.us-east-1.amazonaws.com/dev/api \
    -H "Content-Type: application/json" \
    -d '{
        "type": "del",
        "extension": "airline",
        "schema": ["Customer.json", "Product.json"]
    }'
```

### Generate Schemas with LLM (Future Feature)

```bash
curl -X POST https://{api-id}.execute-api.us-east-1.amazonaws.com/dev/api \
    -H "Content-Type: application/json" \
    -d '{
        "type": "llm",
        "extension": "airline",
        "schema": [
            "A customer object with name, email, and phone number",
            "An order object with items, total, and status"
        ]
    }'
```

**Note**: LLM schema generation is not yet implemented and will return a 501 error.

## Multitenant Access

### URL Structure

- **Default tenant**: `http://{ec2-ip}:8080`
- **Specific tenant**: `http://{tenantId}.frontend2.zanzalaz.com:8080`

### Examples

- Airline tenant: `http://airline.frontend2.zanzalaz.com:8080`
- Bank tenant: `http://bank.frontend2.zanzalaz.com:8080`

## S3 Schema Organization

```
universal-frontend-{account}-{env}/
├── schemas/
│   ├── default/
│   │   ├── employee.json
│   │   ├── location.json
│   │   └── product.json
│   ├── airline/
│   │   ├── customer.json
│   │   └── flight.json
│   └── bank/
│       ├── account.json
│       └── transaction.json
```

## Security

### Passcode Hashing

- Uses HMAC-SHA256 with salt for passcode hashing
- Salt is configurable via environment variable `SALT`
- Default salt should be changed in production

### IAM Roles

- **Lambda Role**: Full access to DynamoDB and S3 bucket
- **EC2 Role**: Read-only access to S3 schemas

### Security Groups

- EC2 instance allows traffic on ports 22 (SSH), 8080 (HTTP), and 443 (HTTPS)

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run original server (single tenant)
npm run dev

# Run multitenant server
npm start
```

### Environment Variables

```bash
# For local development
export AWS_REGION=us-east-1
export S3_BUCKET_NAME=universal-frontend-123456789-dev
export NODE_ENV=development
```

## Monitoring and Troubleshooting

### Health Check

```bash
curl http://{ec2-ip}:8080/health
```

### List Tenant Schemas

```bash
curl http://{ec2-ip}:8080/schemas?tenant=airline
```

### CloudWatch Logs

- Lambda logs: `/aws/lambda/json-blockbuilder-api-dev`
- EC2 logs: Check system logs via SSH

### Common Issues

1. **EC2 not starting**: Check security groups and IAM role
2. **S3 access denied**: Verify EC2 instance profile
3. **Lambda timeout**: Increase timeout in CloudFormation template
4. **API Gateway errors**: Check Lambda permissions

## Cost Optimization

- **DynamoDB**: Uses on-demand billing
- **EC2**: t2.micro instance (free tier eligible)
- **Lambda**: Pay per request
- **S3**: Standard storage with lifecycle policies

## Scaling Considerations

- **Horizontal scaling**: Deploy multiple EC2 instances behind load balancer
- **Database scaling**: DynamoDB auto-scales
- **Storage scaling**: S3 scales automatically
- **API scaling**: API Gateway handles scaling automatically

## Security Best Practices

1. Change default salt in production
2. Use HTTPS for all communications
3. Implement proper CORS policies
4. Add WAF for API Gateway
5. Enable CloudTrail for audit logging
6. Use AWS Secrets Manager for sensitive data 