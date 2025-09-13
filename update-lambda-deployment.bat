@echo off
echo Updating lambda deployment package...
copy lambda_function.py lambda-deployment-dev\lambda_function.py
echo Lambda function updated in deployment package.
