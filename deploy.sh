#!/bin/bash

# Deployment script for JSON Block Builder multitenant infrastructure

set -e

# Configuration
STACK_NAME="json-blockbuilder-multitenant"
REGION="us-east-1"
ENVIRONMENT="dev"

echo "🚀 Deploying JSON Block Builder multitenant infrastructure..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if required parameters are provided
if [ -z "$1" ]; then
    echo "❌ Please provide an EC2 Key Pair name as the first argument"
    echo "Usage: ./deploy.sh <key-pair-name>"
    exit 1
fi

KEY_PAIR_NAME=$1

echo "📦 Deploying CloudFormation stack..."
aws cloudformation deploy \
    --template-file cloudformation-template.yaml \
    --stack-name $STACK_NAME \
    --parameter-overrides \
        Environment=$ENVIRONMENT \
        EC2KeyName=$KEY_PAIR_NAME \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $REGION

echo "✅ CloudFormation stack deployed successfully!"

# Get stack outputs
echo "📋 Getting stack outputs..."
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs' \
    --output json)

# Extract values
API_URL=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="ApiGatewayUrl") | .OutputValue')
S3_BUCKET=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="S3BucketName") | .OutputValue')
EC2_IP=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="EC2PublicIP") | .OutputValue')

echo "🔗 API Gateway URL: $API_URL"
echo "🪣 S3 Bucket: $S3_BUCKET"
echo "🖥️  EC2 Public IP: $EC2_IP"

# Upload initial schemas to S3
echo "📤 Uploading initial schemas to S3..."
aws s3 cp schema/ $S3_BUCKET/schemas/default/ --recursive --region $REGION

echo "✅ Initial schemas uploaded!"

# Create a sample tenant
echo "👤 Creating sample tenant 'airline'..."
curl -X POST $API_URL \
    -H "Content-Type: application/json" \
    -d '{
        "type": "register",
        "extension": "airline",
        "passcode": "airline123"
    }'

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Wait for EC2 instance to fully initialize (5-10 minutes)"
echo "2. Access the application at: http://$EC2_IP:8080"
echo "3. For tenant-specific access: http://airline.frontend2.zanzalaz.com:8080"
echo "4. API endpoint: $API_URL"
echo ""
echo "🔧 To test the API:"
echo "curl -X POST $API_URL \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"type\": \"register\", \"extension\": \"test\", \"passcode\": \"test123\"}'" 