#!/bin/bash

# Check for --log or -l flag in any argument position
sudo killall -9 node
LOG_MODE=false
for arg in "$@"; do
    if [ "$arg" = "--log" ] || [ "$arg" = "-l" ]; then
        LOG_MODE=true
        break
    fi
done

if [ "$LOG_MODE" = true ]; then
    echo "Running server in log mode (direct output, no forever)..." >&2
    sudo env \
    S3_BUCKET_NAME=universal-frontend-720291373173-prod \
    AWS_REGION=us-east-1 \
    FRONTEND_USERS_TABLE_NAME=frontend-users-prod \
    BILLING_TABLE_NAME=billing-admins-prod \
    BILLING_USER_FROM_TENANT_TABLE_NAME=billinguser-from-tenant-prod \
    GOOGLE_CLIENT_ID=455268002946-jm1k7gqjevn52v2bpr440bbr9jr9sgfh.apps.googleusercontent.com \
    STRIPE_INITIAL_PAYMENT_URL=https://buy.stripe.com/8x214n5QOgkX5rmeOZ1VK00 \
    STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/8x214n5QOgkX5rmeOZ1VK00 \
    PAYMENT_ENABLED=false \
    ENVIRONMENT=prod \
    npm start
else
    echo "Running server with forever (background mode)..." >&2
    sudo env \
    S3_BUCKET_NAME=universal-frontend-720291373173-prod \
    AWS_REGION=us-east-1 \
    FRONTEND_USERS_TABLE_NAME=frontend-users-prod \
    BILLING_TABLE_NAME=billing-admins-prod \
    BILLING_USER_FROM_TENANT_TABLE_NAME=billinguser-from-tenant-prod \
    GOOGLE_CLIENT_ID=455268002946-jm1k7gqjevn52v2bpr440bbr9jr9sgfh.apps.googleusercontent.com \
    STRIPE_INITIAL_PAYMENT_URL=https://buy.stripe.com/8x214n5QOgkX5rmeOZ1VK00 \
    STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/8x214n5QOgkX5rmeOZ1VK00 \
    PAYMENT_ENABLED=false \
    ENVIRONMENT=prod \
    forever start -c "npm start" ./
fi