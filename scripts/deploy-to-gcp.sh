#!/bin/bash

# Lockx ZK System - Google Cloud Deployment Script
# This script deploys the entire backend infrastructure to GCP

set -e

echo "🚀 Lockx ZK Production Deployment to Google Cloud"
echo "================================================"

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"your-project-id"}
REGION=${GCP_REGION:-"us-central1"}
BUCKET_NAME="lockx-zk-circuits"
API_SERVICE_NAME="lockx-proof-generator"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Google Cloud. Running 'gcloud auth login'...${NC}"
    gcloud auth login
fi

# Set project
echo -e "${GREEN}Setting project to: $PROJECT_ID${NC}"
gcloud config set project $PROJECT_ID

# Step 1: Create Storage Bucket for Circuits
echo -e "\n${YELLOW}Step 1: Creating Cloud Storage bucket for circuits...${NC}"
if ! gsutil ls -b gs://$BUCKET_NAME &> /dev/null; then
    gsutil mb -p $PROJECT_ID -l $REGION gs://$BUCKET_NAME
    echo -e "${GREEN}✅ Bucket created: gs://$BUCKET_NAME${NC}"
else
    echo -e "${GREEN}✅ Bucket already exists: gs://$BUCKET_NAME${NC}"
fi

# Step 2: Compile Circuits (if not already done)
echo -e "\n${YELLOW}Step 2: Checking circuit compilation...${NC}"
cd circuits

if [ ! -f "ProductionCommitment.r1cs" ]; then
    echo "Compiling circuits..."
    npx circom src/production/ProductionCommitment.circom --r1cs --wasm
    npx circom src/production/ProductionDeposit.circom --r1cs --wasm
    npx circom src/production/ProductionWithdraw.circom --r1cs --wasm
fi
echo -e "${GREEN}✅ Circuits compiled${NC}"

# Step 3: Upload Circuit Files to Cloud Storage
echo -e "\n${YELLOW}Step 3: Uploading circuit files to Cloud Storage...${NC}"

# Upload WASM files
if [ -d "ProductionCommitment_js" ]; then
    gsutil -m cp -r ProductionCommitment_js/* gs://$BUCKET_NAME/commitment/
    echo -e "${GREEN}✅ Commitment circuit uploaded${NC}"
fi

if [ -d "ProductionDeposit_js" ]; then
    gsutil -m cp -r ProductionDeposit_js/* gs://$BUCKET_NAME/deposit/
    echo -e "${GREEN}✅ Deposit circuit uploaded${NC}"
fi

if [ -d "ProductionWithdraw_js" ]; then
    gsutil -m cp -r ProductionWithdraw_js/* gs://$BUCKET_NAME/withdraw/
    echo -e "${GREEN}✅ Withdraw circuit uploaded${NC}"
fi

# Upload zkey files
gsutil cp commitment_final.zkey gs://$BUCKET_NAME/keys/
gsutil cp deposit_final.zkey gs://$BUCKET_NAME/keys/
gsutil cp withdraw_final.zkey gs://$BUCKET_NAME/keys/
echo -e "${GREEN}✅ Proving keys uploaded${NC}"

# Make bucket publicly readable
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME
echo -e "${GREEN}✅ Bucket made public${NC}"

cd ..

# Step 4: Enable Required APIs
echo -e "\n${YELLOW}Step 4: Enabling required Google Cloud APIs...${NC}"
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable firestore.googleapis.com
echo -e "${GREEN}✅ APIs enabled${NC}"

# Step 5: Deploy Proof Generation API to Cloud Run
echo -e "\n${YELLOW}Step 5: Deploying Proof Generation API to Cloud Run...${NC}"
cd api/proof-generator

# Build and deploy using Cloud Build
gcloud builds submit --config cloudbuild.yaml

# Get the service URL
SERVICE_URL=$(gcloud run services describe $API_SERVICE_NAME --region=$REGION --format='value(status.url)')
echo -e "${GREEN}✅ API deployed at: $SERVICE_URL${NC}"

cd ../..

# Step 6: Test the deployment
echo -e "\n${YELLOW}Step 6: Testing the deployment...${NC}"

# Test health endpoint
if curl -s "$SERVICE_URL/health" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

# Test circuits endpoint
echo "Available circuits:"
curl -s "$SERVICE_URL/api/circuits" | python3 -m json.tool

# Step 7: Create Firestore indexes (for commitment tracking)
echo -e "\n${YELLOW}Step 7: Setting up Firestore for commitment indexing...${NC}"
gcloud firestore databases create --region=$REGION --type=firestore-native 2>/dev/null || true

# Create indexes file
cat > firestore.indexes.json << EOF
{
  "indexes": [
    {
      "collectionGroup": "commitments",
      "fields": [
        { "fieldPath": "timestamp", "order": "DESCENDING" },
        { "fieldPath": "blockNumber", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "nullifiers",
      "fields": [
        { "fieldPath": "used", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ]
}
EOF

gcloud firestore indexes create --file=firestore.indexes.json
echo -e "${GREEN}✅ Firestore configured${NC}"

# Step 8: Set up monitoring (optional)
echo -e "\n${YELLOW}Step 8: Setting up monitoring...${NC}"
gcloud monitoring dashboards create --config-from-file=- <<EOF
{
  "displayName": "Lockx ZK System Dashboard",
  "dashboardFilters": [],
  "gridLayout": {
    "widgets": [
      {
        "title": "Proof Generation Latency",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$API_SERVICE_NAME\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "perSeriesAligner": "ALIGN_MEAN"
                }
              }
            }
          }]
        }
      }
    ]
  }
}
EOF
echo -e "${GREEN}✅ Monitoring dashboard created${NC}"

# Summary
echo -e "\n${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "📍 Your ZK Proof Generation API is live at:"
echo -e "${GREEN}$SERVICE_URL${NC}"
echo ""
echo "📊 Available Endpoints:"
echo "  GET  $SERVICE_URL/health"
echo "  GET  $SERVICE_URL/api/circuits"
echo "  POST $SERVICE_URL/api/generate-proof"
echo "  POST $SERVICE_URL/api/generate-commitment"
echo "  POST $SERVICE_URL/api/verify-proof"
echo ""
echo "🔐 Circuit Files Hosted at:"
echo "  https://storage.googleapis.com/$BUCKET_NAME/commitment/commitment.wasm"
echo "  https://storage.googleapis.com/$BUCKET_NAME/keys/commitment_final.zkey"
echo ""
echo "💰 Estimated Monthly Cost: ~\$100-300 (depending on usage)"
echo ""
echo "📝 Next Steps:"
echo "  1. Deploy smart contracts to Ethereum/L2"
echo "  2. Update frontend to use API endpoint"
echo "  3. Configure custom domain (optional)"
echo "  4. Set up CI/CD pipeline"
echo ""
echo -e "${YELLOW}⚠️  Remember to update your frontend with the API URL!${NC}"