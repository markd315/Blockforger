# PowerShell test script for JSON Block Builder API

# Configuration
$ApiUrl = ""
$S3Bucket = ""
$Ec2Ip = ""

Write-Host "🧪 Testing JSON Block Builder API..." -ForegroundColor Yellow

# Get stack outputs if not provided
if (-not $ApiUrl) {
    Write-Host "📋 Getting stack outputs..." -ForegroundColor Yellow
    try {
        $StackOutputs = aws cloudformation describe-stacks `
            --stack-name json-blockbuilder-multitenant `
            --region us-east-1 `
            --query 'Stacks[0].Outputs' `
            --output json | ConvertFrom-Json
        
        $ApiUrl = ($StackOutputs | Where-Object { $_.OutputKey -eq "ApiGatewayUrl" }).OutputValue
        $S3Bucket = ($StackOutputs | Where-Object { $_.OutputKey -eq "S3BucketName" }).OutputValue
        $Ec2Ip = ($StackOutputs | Where-Object { $_.OutputKey -eq "EC2PublicIP" }).OutputValue
    } catch {
        Write-Host "❌ Could not get stack outputs" -ForegroundColor Red
    }
}

if (-not $ApiUrl) {
    Write-Host "❌ Could not get API URL from CloudFormation stack" -ForegroundColor Red
    Write-Host "Please provide the API URL manually:" -ForegroundColor Yellow
    Write-Host '$ApiUrl = "https://your-api-id.execute-api.us-east-1.amazonaws.com/dev/api"'
    exit 1
}

Write-Host "✅ API URL: $ApiUrl" -ForegroundColor Green

# Test 1: Register a test tenant
Write-Host "`n📝 Test 1: Registering test tenant..." -ForegroundColor Yellow
$RegisterBody = @{
    type = "register"
    extension = "test-tenant"
    passcode = "test-passcode-123"
} | ConvertTo-Json

try {
    $RegisterResponse = Invoke-RestMethod -Uri $ApiUrl -Method POST -Body $RegisterBody -ContentType "application/json"
    Write-Host "Response: $($RegisterResponse | ConvertTo-Json)" -ForegroundColor Cyan
    
    if ($RegisterResponse.message -like "*registered successfully*") {
        Write-Host "✅ Tenant registration successful" -ForegroundColor Green
    } else {
        Write-Host "❌ Tenant registration failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Tenant registration failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Upload JSON schemas
Write-Host "`n📝 Test 2: Uploading JSON schemas..." -ForegroundColor Yellow
$JsonBody = @{
    type = "json"
    extension = "test-tenant"
    schema = @(
        '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"customer.json","title":"Customer","description":"A customer object","type":"object","properties":{"name":{"type":"string","description":"Customer name"},"email":{"type":"string","format":"email","description":"Customer email"},"age":{"type":"integer","minimum":0,"description":"Customer age"}},"required":["name","email"]}',
        '{"$schema":"https://json-schema.org/draft/2019-09/schema","$id":"product.json","title":"Product","description":"A product object","type":"object","properties":{"name":{"type":"string","description":"Product name"},"price":{"type":"number","minimum":0,"description":"Product price"},"category":{"type":"string","description":"Product category"}},"required":["name","price"]}'
    )
} | ConvertTo-Json

try {
    $JsonResponse = Invoke-RestMethod -Uri $ApiUrl -Method POST -Body $JsonBody -ContentType "application/json"
    Write-Host "Response: $($JsonResponse | ConvertTo-Json)" -ForegroundColor Cyan
    
    if ($JsonResponse.message -like "*Uploaded*") {
        Write-Host "✅ JSON schema upload successful" -ForegroundColor Green
    } else {
        Write-Host "❌ JSON schema upload failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ JSON schema upload failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Generate schemas with LLM (should fail gracefully)
Write-Host "`n📝 Test 3: Testing LLM endpoint (should return not implemented)..." -ForegroundColor Yellow
$LlmBody = @{
    type = "llm"
    extension = "test-tenant"
    schema = @(
        "A user object with name, email, and age",
        "A product object with name, price, and category"
    )
} | ConvertTo-Json

try {
    $LlmResponse = Invoke-RestMethod -Uri $ApiUrl -Method POST -Body $LlmBody -ContentType "application/json"
    Write-Host "Response: $($LlmResponse | ConvertTo-Json)" -ForegroundColor Cyan
    
    if ($LlmResponse.error -like "*not yet implemented*") {
        Write-Host "✅ LLM endpoint correctly returns not implemented" -ForegroundColor Green
    } else {
        Write-Host "❌ LLM endpoint test failed" -ForegroundColor Red
    }
} catch {
    Write-Host "✅ LLM endpoint correctly returns not implemented (HTTP 501)" -ForegroundColor Green
}

# Test 4: Delete schemas
Write-Host "`n📝 Test 4: Deleting schemas..." -ForegroundColor Yellow
$DeleteBody = @{
    type = "del"
    extension = "test-tenant"
    schema = @("Customer.json", "Product.json")
} | ConvertTo-Json

try {
    $DeleteResponse = Invoke-RestMethod -Uri $ApiUrl -Method POST -Body $DeleteBody -ContentType "application/json"
    Write-Host "Response: $($DeleteResponse | ConvertTo-Json)" -ForegroundColor Cyan
    
    if ($DeleteResponse.message -like "*Deleted*") {
        Write-Host "✅ Schema deletion successful" -ForegroundColor Green
    } else {
        Write-Host "❌ Schema deletion failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Schema deletion failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Health check (if EC2 IP is available)
if ($Ec2Ip) {
    Write-Host "`n📝 Test 5: Health check..." -ForegroundColor Yellow
    try {
        $HealthResponse = Invoke-RestMethod -Uri "http://$Ec2Ip`:8080/health" -Method GET
        Write-Host "Response: $($HealthResponse | ConvertTo-Json)" -ForegroundColor Cyan
        
        if ($HealthResponse.status -eq "healthy") {
            Write-Host "✅ Health check successful" -ForegroundColor Green
        } else {
            Write-Host "❌ Health check failed" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  Skipping health check (EC2 IP not available)" -ForegroundColor Yellow
}

# Test 6: List schemas (if EC2 IP is available)
if ($Ec2Ip) {
    Write-Host "`n📝 Test 6: List schemas..." -ForegroundColor Yellow
    try {
        $SchemasResponse = Invoke-RestMethod -Uri "http://$Ec2Ip`:8080/schemas?tenant=test-tenant" -Method GET
        Write-Host "Response: $($SchemasResponse | ConvertTo-Json)" -ForegroundColor Cyan
        
        if ($SchemasResponse -and $SchemasResponse.Count -gt 0) {
            Write-Host "✅ Schema listing successful" -ForegroundColor Green
        } else {
            Write-Host "❌ Schema listing failed" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Schema listing failed: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  Skipping schema listing (EC2 IP not available)" -ForegroundColor Yellow
}

Write-Host "`n🎉 API testing completed!" -ForegroundColor Green

# Summary
Write-Host "`n📊 Summary:" -ForegroundColor Yellow
Write-Host "API URL: $ApiUrl"
if ($S3Bucket) {
    Write-Host "S3 Bucket: $S3Bucket"
}
if ($Ec2Ip) {
    Write-Host "EC2 IP: $Ec2Ip"
    Write-Host "Application URL: http://$Ec2Ip`:8080"
} 