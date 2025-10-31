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
    echo "Running server in log mode (direct output, no forever)..."
    sudo env \
    S3_BUCKET_NAME=universal-frontend-720291373173-dev \
    AWS_REGION=us-east-1 \
    FRONTEND_USERS_TABLE_NAME=frontend-users \
    BILLING_TABLE_NAME=billing-admins \
    BILLING_USER_FROM_TENANT_TABLE_NAME=billinguser-from-tenant-dev \
    GOOGLE_CLIENT_ID=455268002946-ha6rmffbk6m9orbe7utljm69sj54akqv.apps.googleusercontent.com \
    STRIPE_INITIAL_PAYMENT_URL=https://buy.stripe.com/test_28E14n7945li2ttcuQ8so02 \
    STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/test_00weVd50W8xu3xx8eA8so00 \
    PAYMENT_ENABLED=false \
    ENVIRONMENT=dev \
    npm start
else
    echo "Running server with forever (background mode)..."
    sudo env \
    S3_BUCKET_NAME=universal-frontend-720291373173-dev \
    AWS_REGION=us-east-1 \
    FRONTEND_USERS_TABLE_NAME=frontend-users \
    BILLING_TABLE_NAME=billing-admins \
    BILLING_USER_FROM_TENANT_TABLE_NAME=billinguser-from-tenant-dev \
    GOOGLE_CLIENT_ID=455268002946-ha6rmffbk6m9orbe7utljm69sj54akqv.apps.googleusercontent.com \
    STRIPE_INITIAL_PAYMENT_URL=https://buy.stripe.com/test_28E14n7945li2ttcuQ8so02 \
    STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/test_00weVd50W8xu3xx8eA8so00 \
    PAYMENT_ENABLED=false \
    ENVIRONMENT=dev \
    forever start -c "npm start" ./
fi