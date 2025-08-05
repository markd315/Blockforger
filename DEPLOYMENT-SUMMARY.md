# JSON Block Builder - Multitenant Cloud Deployment Summary

## 🚀 Refactoring Overview

The JSON Block Builder application has been successfully refactored to support a multitenant cloud strategy using AWS services. Here's what was implemented:

## 📋 Components Created

### 1. **CloudFormation Template** (`cloudformation-template.yaml`)
- **Lambda Function**: Handles tenant registration, schema deletion, and LLM schema generation
- **API Gateway**: REST API endpoint for the Lambda function
- **DynamoDB Table**: Stores tenant information with secure passcode hashing
- **S3 Bucket**: Stores schemas organized by tenant (`schemas/{tenantId}/`)
- **EC2 Instance**: t2.micro running the JavaScript application
- **EIP**: Static IP "frontend2" for the EC2 instance
- **IAM Roles**: Proper permissions for Lambda and EC2
- **Security Groups**: Open web traffic on ports 8080 and 443

### 2. **Lambda Function** (`lambda_function.py`)
- **Register**: Creates new tenants with bcrypt-hashed passcodes
- **Delete**: Removes schema files from S3
- **JSON**: Uploads JSON schema strings directly to S3 (MVP feature)
- **LLM**: Placeholder for future LLM schema generation
- **Error Handling**: Comprehensive error handling and validation
- **Security**: HMAC-SHA256 hashing with salt for passcodes

### 3. **Multitenant Server** (`server.js`)
- **Tenant Detection**: Extracts tenant ID from hostname
- **S3 Integration**: Dynamically loads schemas from S3 based on tenant
- **Health Endpoints**: `/health` and `/schemas` for monitoring
- **Fallback Support**: Local development with query parameters

### 4. **Deployment Scripts**
- **Bash**: `deploy.sh` for Linux/macOS users
- **PowerShell**: `deploy.ps1` for Windows users
- **Testing**: `test-api.sh` and `test-api.ps1` for API validation

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │───▶│   Lambda Func   │───▶│   DynamoDB      │
│   (REST API)    │    │   (Python)      │    │   (Users)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   S3 Bucket     │
                       │   (Schemas)     │
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   EC2 Instance  │
                       │   (Node.js App) │
                       └─────────────────┘
```

## 🔧 API Endpoints

### Register Tenant
```bash
POST /api
{
  "type": "register",
  "extension": "airline",
  "passcode": "secure-passcode-123"
}
```

### Upload JSON Schemas (MVP)
```bash
POST /api
{
  "type": "json",
  "extension": "airline",
  "schema": [
    "{\"$schema\":\"https://json-schema.org/draft/2019-09/schema\",\"$id\":\"customer.json\",\"title\":\"Customer\",\"description\":\"A customer object\",\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Customer name\"},\"email\":{\"type\":\"string\",\"format\":\"email\",\"description\":\"Customer email\"}},\"required\":[\"name\",\"email\"]}"
  ]
}
```

### Delete Schemas
```bash
POST /api
{
  "type": "del",
  "extension": "airline",
  "schema": ["Customer.json", "Product.json"]
}
```

### Generate LLM Schemas (Future Feature)
```bash
POST /api
{
  "type": "llm",
  "extension": "airline",
  "schema": [
    "A customer object with name, email, and phone number",
    "An order object with items, total, and status"
  ]
}
```

**Note**: LLM schema generation returns a 501 error as it's not yet implemented.

## 🌐 Multitenant Access

### URL Structure
- **Default**: `http://{ec2-ip}:8080`
- **Tenant-specific**: `http://{tenantId}.frontend2.zanzalaz.com:8080`

### Examples
- Airline: `http://airline.frontend2.zanzalaz.com:8080`
- Bank: `http://bank.frontend2.zanzalaz.com:8080`

## 📦 S3 Schema Organization

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

## 🚀 Deployment Instructions

### Prerequisites
1. **AWS CLI** installed and configured
2. **EC2 Key Pair** created in us-east-1
3. **jq** (optional, for bash deployment script)

### Windows Deployment
```powershell
.\deploy.ps1 -KeyPairName "your-key-pair-name"
```

### Linux/macOS Deployment
```bash
chmod +x deploy.sh
./deploy.sh your-key-pair-name
```

### Manual Deployment
```bash
aws cloudformation deploy \
    --template-file cloudformation-template.yaml \
    --stack-name json-blockbuilder-multitenant \
    --parameter-overrides Environment=dev EC2KeyName=your-key-pair-name \
    --capabilities CAPABILITY_NAMED_IAM \
    --region us-east-1
```

## 🧪 Testing

### Windows Testing
```powershell
.\test-api.ps1
```

### Linux/macOS Testing
```bash
chmod +x test-api.sh
./test-api.sh
```

## 🔒 Security Features

### Passcode Hashing
- Uses HMAC-SHA256 with configurable salt
- Salt stored in environment variable `SALT`
- Default salt should be changed in production

### IAM Permissions
- **Lambda**: Full access to DynamoDB and S3 bucket
- **EC2**: Read-only access to S3 schemas
- **Principle of Least Privilege**: Minimal required permissions

### Network Security
- Security groups configured for required ports only
- No public access to DynamoDB or S3
- API Gateway with proper CORS headers

## 📊 Monitoring

### Health Checks
```bash
curl http://{ec2-ip}:8080/health
```

### Schema Listing
```bash
curl http://{ec2-ip}:8080/schemas?tenant=airline
```

### CloudWatch Logs
- Lambda: `/aws/lambda/json-blockbuilder-api-dev`
- EC2: System logs via SSH

## 💰 Cost Optimization

- **DynamoDB**: On-demand billing (pay per request)
- **EC2**: t2.micro (free tier eligible)
- **Lambda**: Pay per request
- **S3**: Standard storage with lifecycle policies
- **API Gateway**: Pay per request

## 🔄 Scaling Considerations

### Horizontal Scaling
- Deploy multiple EC2 instances behind Application Load Balancer
- Use Auto Scaling Group for automatic scaling

### Database Scaling
- DynamoDB auto-scales based on demand
- Consider read replicas for high-read workloads

### Storage Scaling
- S3 scales automatically
- Consider CloudFront for global content delivery

### API Scaling
- API Gateway handles scaling automatically
- Consider caching strategies

## 🛠️ Development

### Local Development
```bash
# Install dependencies
npm install

# Run server (multitenant)
npm start
```

### Environment Variables
```bash
export AWS_REGION=us-east-1
export S3_BUCKET_NAME=universal-frontend-123456789-dev
export NODE_ENV=development
```

## 🚨 Troubleshooting

### Common Issues

1. **EC2 not starting**
   - Check security groups
   - Verify IAM instance profile
   - Check CloudWatch logs

2. **S3 access denied**
   - Verify EC2 instance profile
   - Check bucket permissions
   - Ensure bucket name is correct

3. **Lambda timeout**
   - Increase timeout in CloudFormation template
   - Check Lambda logs for errors

4. **API Gateway errors**
   - Verify Lambda permissions
   - Check CORS configuration
   - Ensure proper request format

### Debug Commands

```bash
# Check EC2 status
aws ec2 describe-instances --instance-ids {instance-id}

# Check Lambda logs
aws logs describe-log-groups --log-group-name-prefix json-blockbuilder

# Test API directly
curl -X POST {api-url} -H "Content-Type: application/json" -d '{"type":"register","extension":"test","passcode":"test123"}'
```

## 📈 Next Steps

1. **Production Hardening**
   - Change default salt
   - Enable HTTPS
   - Add WAF protection
   - Enable CloudTrail logging

2. **Feature Enhancements**
   - Implement real LLM integration
   - Add schema validation
   - Implement tenant isolation
   - Add monitoring and alerting

3. **Performance Optimization**
   - Add CloudFront CDN
   - Implement caching strategies
   - Optimize Lambda cold starts
   - Add database connection pooling

## 📞 Support

For issues or questions:
1. Check CloudWatch logs
2. Review this documentation
3. Test with provided scripts
4. Verify AWS credentials and permissions

---

**🎉 The JSON Block Builder is now ready for multitenant cloud deployment!** 