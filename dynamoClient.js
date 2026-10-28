const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

// Region: Read from .env, environment, or default to ap-south-1
const clientConfig = {
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1',
};

// Optional: for local development with LocalStack or DynamoDB Local
if (process.env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

// When running on EC2 with an attached IAM Role, DynamoDBClient automatically retrieves
// temporary credentials from the EC2 Instance Metadata Service (IMDS).
// No static Access Key ID or Secret Access Key is required!
const client = new DynamoDBClient(clientConfig);

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

module.exports = {
  client,
  docClient,
  TABLE_NAME: process.env.DYNAMODB_TABLE_NAME || 'User',
};
