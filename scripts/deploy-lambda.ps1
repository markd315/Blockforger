# Deploy Lambda function with dependencies
param(
    [string]$Environment = "dev",
    [string]$FunctionName = "json-blockbuilder-api-dev"
)

Write-Host "Building Lambda deployment package..."

# Create a temporary directory for the deployment package
$TempDir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
Set-Location $TempDir

# Copy the Lambda function code
Copy-Item "..\lambda_function.py" .

# Install dependencies
pip install -r "..\requirements.txt" -t .

# Create the deployment package
Compress-Archive -Path * -DestinationPath "lambda-deployment.zip"

# Get the bucket name
$AccountId = aws sts get-caller-identity --query Account --output text
$BucketName = "lambda-deployment-$AccountId-$Environment"

# Upload to S3
Write-Host "Uploading to S3 bucket: $BucketName"
aws s3 cp lambda-deployment.zip "s3://$BucketName/lambda-deployment-$Environment.zip"

# Update the Lambda function code
Write-Host "Updating Lambda function: $FunctionName"
aws lambda update-function-code `
    --function-name $FunctionName `
    --s3-bucket $BucketName `
    --s3-key "lambda-deployment-$Environment.zip"

# Clean up
Set-Location ..
Remove-Item -Recurse -Force $TempDir

Write-Host "Lambda deployment complete!"
