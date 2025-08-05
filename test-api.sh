#!/bin/bash

# Test script for JSON Block Builder API

set -e

# Configuration
API_URL=""
S3_BUCKET=""
EC2_IP=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Testing JSON Block Builder API...${NC}"

# Get stack outputs if not provided
if [ -z "$API_URL" ]; then
    echo "📋 Getting stack outputs..."
    STACK_OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name json-blockbuilder-multitenant \
        --region us-east-1 \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null || echo "[]")
    
    API_URL=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="ApiGatewayUrl") | .OutputValue // empty')
    S3_BUCKET=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="S3BucketName") | .OutputValue // empty')
    EC2_IP=$(echo $STACK_OUTPUTS | jq -r '.[] | select(.OutputKey=="EC2PublicIP") | .OutputValue // empty')
fi

if [ -z "$API_URL" ]; then
    echo -e "${RED}❌ Could not get API URL from CloudFormation stack${NC}"
    echo "Please provide the API URL manually:"
    echo "export API_URL='https://your-api-id.execute-api.us-east-1.amazonaws.com/dev/api'"
    exit 1
fi

echo -e "${GREEN}✅ API URL: $API_URL${NC}"

# Test 1: Register a test tenant
echo -e "\n${YELLOW}📝 Test 1: Registering test tenant...${NC}"
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "type": "register",
        "extension": "test-tenant",
        "passcode": "test-passcode-123"
    }')

echo "Response: $REGISTER_RESPONSE"

if echo "$REGISTER_RESPONSE" | grep -q "Tenant registered successfully"; then
    echo -e "${GREEN}✅ Tenant registration successful${NC}"
else
    echo -e "${RED}❌ Tenant registration failed${NC}"
fi

# Test 2: Upload JSON schemas
echo -e "\n${YELLOW}📝 Test 2: Uploading JSON schemas...${NC}"
JSON_RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "type": "json",
        "extension": "test-tenant",
        "schema": [
            "{\"$schema\":\"https://json-schema.org/draft/2019-09/schema\",\"$id\":\"customer.json\",\"title\":\"Customer\",\"description\":\"A customer object\",\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Customer name\"},\"email\":{\"type\":\"string\",\"format\":\"email\",\"description\":\"Customer email\"},\"age\":{\"type\":\"integer\",\"minimum\":0,\"description\":\"Customer age\"}},\"required\":[\"name\",\"email\"]}",
            "{\"$schema\":\"https://json-schema.org/draft/2019-09/schema\",\"$id\":\"product.json\",\"title\":\"Product\",\"description\":\"A product object\",\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Product name\"},\"price\":{\"type\":\"number\",\"minimum\":0,\"description\":\"Product price\"},\"category\":{\"type\":\"string\",\"description\":\"Product category\"}},\"required\":[\"name\",\"price\"]}"
        ]
    }')

echo "Response: $JSON_RESPONSE"

if echo "$JSON_RESPONSE" | grep -q "Uploaded"; then
    echo -e "${GREEN}✅ JSON schema upload successful${NC}"
else
    echo -e "${RED}❌ JSON schema upload failed${NC}"
fi

# Test 3: Generate schemas with LLM (should fail gracefully)
echo -e "\n${YELLOW}📝 Test 3: Testing LLM endpoint (should return not implemented)...${NC}"
LLM_RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "type": "llm",
        "extension": "test-tenant",
        "schema": [
            "A user object with name, email, and age",
            "A product object with name, price, and category"
        ]
    }')

echo "Response: $LLM_RESPONSE"

if echo "$LLM_RESPONSE" | grep -q "not yet implemented"; then
    echo -e "${GREEN}✅ LLM endpoint correctly returns not implemented${NC}"
else
    echo -e "${RED}❌ LLM endpoint test failed${NC}"
fi

# Test 4: Delete schemas
echo -e "\n${YELLOW}📝 Test 4: Deleting schemas...${NC}"
DELETE_RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "type": "del",
        "extension": "test-tenant",
        "schema": ["Customer.json", "Product.json"]
    }')

echo "Response: $DELETE_RESPONSE"

if echo "$DELETE_RESPONSE" | grep -q "Deleted"; then
    echo -e "${GREEN}✅ Schema deletion successful${NC}"
else
    echo -e "${RED}❌ Schema deletion failed${NC}"
fi

# Test 5: Health check (if EC2 IP is available)
if [ ! -z "$EC2_IP" ]; then
    echo -e "\n${YELLOW}📝 Test 5: Health check...${NC}"
    HEALTH_RESPONSE=$(curl -s "http://$EC2_IP:8080/health" || echo "Connection failed")
    
    echo "Response: $HEALTH_RESPONSE"
    
    if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
        echo -e "${GREEN}✅ Health check successful${NC}"
    else
        echo -e "${RED}❌ Health check failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping health check (EC2 IP not available)${NC}"
fi

# Test 6: List schemas (if EC2 IP is available)
if [ ! -z "$EC2_IP" ]; then
    echo -e "\n${YELLOW}📝 Test 6: List schemas...${NC}"
    SCHEMAS_RESPONSE=$(curl -s "http://$EC2_IP:8080/schemas?tenant=test-tenant" || echo "Connection failed")
    
    echo "Response: $SCHEMAS_RESPONSE"
    
    if echo "$SCHEMAS_RESPONSE" | grep -q "employee\|product\|location"; then
        echo -e "${GREEN}✅ Schema listing successful${NC}"
    else
        echo -e "${RED}❌ Schema listing failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping schema listing (EC2 IP not available)${NC}"
fi

echo -e "\n${GREEN}🎉 API testing completed!${NC}"

# Summary
echo -e "\n${YELLOW}📊 Summary:${NC}"
echo "API URL: $API_URL"
if [ ! -z "$S3_BUCKET" ]; then
    echo "S3 Bucket: $S3_BUCKET"
fi
if [ ! -z "$EC2_IP" ]; then
    echo "EC2 IP: $EC2_IP"
    echo "Application URL: http://$EC2_IP:8080"
fi 