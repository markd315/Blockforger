# PowerShell deployment script for JSON Block Builder multitenant infrastructure

param(
    [Parameter(Mandatory=$true)]
    [string]$KeyPairName
)

# Configuration
$StackName = "json-blockbuilder-multitenant"
$Region = "us-east-1"
$Environment = "dev"
$DeploymentId = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')

Write-Host "🚀 Deploying JSON Block Builder multitenant infrastructure..." -ForegroundColor Yellow

# Check if AWS CLI is installed
try {
    aws --version | Out-Null
} catch {
    Write-Host "❌ AWS CLI is not installed. Please install it first." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Deploying CloudFormation stack..." -ForegroundColor Yellow
aws cloudformation deploy `
    --template-file cloudformation-template.yaml `
    --stack-name $StackName `
    --parameter-overrides Environment=$Environment EC2KeyName=$KeyPairName DeploymentId=$DeploymentId `
    --capabilities CAPABILITY_NAMED_IAM `
    --region $Region

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ CloudFormation stack deployed successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ CloudFormation deployment failed!" -ForegroundColor Red
    exit 1
}

# Get stack outputs
Write-Host "📋 Getting stack outputs..." -ForegroundColor Yellow
$StackOutputs = aws cloudformation describe-stacks `
    --stack-name $StackName `
    --region $Region `
    --query 'Stacks[0].Outputs' `
    --output json | ConvertFrom-Json

# Extract values
$ApiUrl = ($StackOutputs | Where-Object { $_.OutputKey -eq "ApiGatewayUrl" }).OutputValue
$S3Bucket = ($StackOutputs | Where-Object { $_.OutputKey -eq "S3BucketName" }).OutputValue
$Ec2Ip = ($StackOutputs | Where-Object { $_.OutputKey -eq "EC2PublicIP" }).OutputValue

Write-Host "🔗 API Gateway URL: $ApiUrl" -ForegroundColor Green
Write-Host "🪣 S3 Bucket: $S3Bucket" -ForegroundColor Green
Write-Host "🖥️  EC2 Public IP: $Ec2Ip" -ForegroundColor Green

# Upload initial schemas to S3
Write-Host "📤 Uploading initial schemas to S3..." -ForegroundColor Yellow
aws s3 cp schema/ $S3Bucket/schemas/default/ --recursive --region $Region

Write-Host "✅ Initial schemas uploaded!" -ForegroundColor Green

# Create a sample tenant
Write-Host "👤 Creating sample tenant 'airline'..." -ForegroundColor Yellow
$RegisterBody = @{
    type = "register"
    extension = "airline"
    passcode = "airline123"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri $ApiUrl -Method POST -Body $RegisterBody -ContentType "application/json"
    Write-Host "✅ Sample tenant created successfully!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Warning: Could not create sample tenant. You can create it manually later." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Yellow
Write-Host "1. Wait for EC2 instance to fully initialize (5-10 minutes)"
Write-Host "2. Access the application at: http://$Ec2Ip`:8080"
Write-Host "3. For tenant-specific access: http://airline.frontend2.zanzalaz.com:8080"
Write-Host "4. API endpoint: $ApiUrl"
Write-Host ""
Write-Host "🔧 To test the API:" -ForegroundColor Yellow
Write-Host "Invoke-RestMethod -Uri '$ApiUrl' -Method POST -Body '{\"type\": \"register\", \"extension\": \"test\", \"passcode\": \"test123\"}' -ContentType 'application/json'" 