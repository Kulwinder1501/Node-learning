require('dotenv').config();
const express = require('express');
const { GetCommand, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { client, docClient, TABLE_NAME } = require('./dynamoClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Cache for table partition key name
let cachedPartitionKey = process.env.DYNAMODB_KEY_NAME || null;

async function getPartitionKeyName() {
  if (cachedPartitionKey) return cachedPartitionKey;
  try {
    const describeRes = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    const hashKey = describeRes.Table?.KeySchema?.find((k) => k.KeyType === 'HASH');
    if (hashKey?.AttributeName) {
      cachedPartitionKey = hashKey.AttributeName;
      return cachedPartitionKey;
    }
  } catch (err) {
    console.warn(`Could not auto-detect partition key via DescribeTable: ${err.message}. Defaulting to 'id'.`);
  }
  return 'id';
}

// Health check route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: "Server is working",
    table: TABLE_NAME,
    auth: 'EC2 IAM Role / Default Provider',
    region: process.env.AWS_REGION || 'auto-detected',
  });
});

// 1. Fetch all users (Scan) - easiest way to fetch the user you created
app.get('/users', async (req, res) => {
  try {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
    });
    const result = await docClient.send(command);

    res.json({
      success: true,
      count: result.Items?.length || 0,
      data: result.Items || [],
    });
  } catch (error) {
    console.error('Error scanning users from DynamoDB:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users from DynamoDB',
      error: error.message,
    });
  }
});

// 2. Fetch a single user by primary key (Get)
// Example: GET /users/123 or GET /users/123?keyName=userId
app.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  const keyName = req.query.keyName || (await getPartitionKeyName());

  // Check if id is numeric or string
  const parsedId = isNaN(id) ? id : (Number(id).toString() === id ? Number(id) : id);

  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        [keyName]: parsedId,
      },
    });

    const result = await docClient.send(command);

    if (!result.Item) {
      // If not found with converted type, try the original string version if it was parsed as number
      if (typeof parsedId !== 'string') {
        const fallbackCommand = new GetCommand({
          TableName: TABLE_NAME,
          Key: { [keyName]: id },
        });
        const fallbackResult = await docClient.send(fallbackCommand);
        if (fallbackResult.Item) {
          return res.json({
            success: true,
            data: fallbackResult.Item,
          });
        }
      }

      return res.status(404).json({
        success: false,
        message: `User with ${keyName}='${id}' not found in table '${TABLE_NAME}'`,
      });
    }

    res.json({
      success: true,
      data: result.Item,
    });
  } catch (error) {
    console.error(`Error fetching user with ${keyName}=${id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user from DynamoDB',
      error: error.message,
      tip: `Ensure '${keyName}' is the correct partition key and your EC2 IAM Role has dynamodb:GetItem permission on '${TABLE_NAME}'.`,
    });
  }
});

// 3. Create a new user (Put)
app.post('/users', async (req, res) => {
  const userData = req.body;
  const keyName = await getPartitionKeyName();

  if (!userData || Object.keys(userData).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Request body cannot be empty',
    });
  }

  // Ensure the partition key exists in the payload, or assign a random id if missing
  if (userData[keyName] === undefined) {
    userData[keyName] = Date.now().toString();
  }

  try {
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: userData,
    });

    await docClient.send(command);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userData,
    });
  } catch (error) {
    console.error('Error creating user in DynamoDB:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user in DynamoDB',
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Connected to DynamoDB table: '${TABLE_NAME}' (Region: ${process.env.AWS_REGION || 'auto-detected'})`);
  console.log(`Authentication: EC2 IAM Role / Default Credential Provider Chain`);
});
