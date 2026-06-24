#!/bin/bash

# Exit on error
set -e

echo "🚀 Setting up GCP for Termcaller..."

# 1. Variables (Change these as needed)
PROJECT_ID="termcaller-hackathon"
REGION="us-central1"
BUCKET_NAME="termcaller-sqlite-data"
SERVICE_NAME="termcaller-app"

# 2. Authenticate (uncomment if not authenticated)
# gcloud auth login

# 3. Create Project
echo "📦 Creating project $PROJECT_ID..."
gcloud projects create $PROJECT_ID --name="Termcaller" || echo "Project might already exist"
gcloud config set project $PROJECT_ID

# 4. Enable Required APIs
echo "🔌 Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com

# 5. Create Cloud Storage Bucket for SQLite data
echo "🪣 Creating Cloud Storage bucket $BUCKET_NAME..."
gcloud storage buckets create gs://$BUCKET_NAME --location=$REGION || echo "Bucket might already exist"

# 6. Create Service Account for Cloud Run
echo "🔐 Creating Service Account..."
SA_NAME="cloud-run-sqlite"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create $SA_NAME \
    --display-name="Cloud Run SQLite Service Account" || echo "Service account might already exist"

# 7. Grant Service Account access to the bucket
echo "🔑 Granting bucket access..."
gcloud storage buckets add-iam-policy-binding gs://$BUCKET_NAME \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/storage.objectAdmin"

# 8. Build and Deploy to Cloud Run
echo "🚀 Building and Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --service-account $SA_EMAIL \
  --execution-environment gen2 \
  --add-volume=name=sqlite-data,type=cloud-storage,bucket=$BUCKET_NAME \
  --add-volume-mount=volume=sqlite-data,mount-path=/mnt/data \
  --set-env-vars="DATABASE_URL=file:/mnt/data/database.sqlite"

echo "✅ Deployment complete!"
