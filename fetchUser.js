/**
 * Quick script to fetch user(s) directly from DynamoDB in the console.
 * Usage:
 *   node fetchUser.js           -> Fetches all users from the User table (Scan)
 *   node fetchUser.js <id>      -> Fetches a user by partition key value
 */

const { ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { client, docClient, TABLE_NAME } = require('./dynamoClient');

async function getPartitionKeyName() {
  try {
    const describe = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    const hashKey = describe.Table?.KeySchema?.find((k) => k.KeyType === 'HASH');
    return hashKey?.AttributeName || 'id';
  } catch (err) {
    return process.env.DYNAMODB_KEY_NAME || 'id';
  }
}

async function main() {
  const targetId = process.argv[2];

  console.log(`\n========================================`);
  console.log(`  DynamoDB Fetch Tool`);
  console.log(`  Table:  ${TABLE_NAME}`);
  console.log(`  Auth:   EC2 IAM Role / Default AWS Provider`);
  console.log(`========================================\n`);

  try {
    if (targetId) {
      // Fetch by ID
      const keyName = await getPartitionKeyName();
      console.log(`Fetching user with ${keyName} = "${targetId}"...`);

      const parsedId = isNaN(targetId) ? targetId : (Number(targetId).toString() === targetId ? Number(targetId) : targetId);

      let result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { [keyName]: parsedId },
        })
      );

      // Fallback to string if parsed as number
      if (!result.Item && typeof parsedId !== 'string') {
        result = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { [keyName]: targetId },
          })
        );
      }

      if (result.Item) {
        console.log(`\nUser found:`);
        console.dir(result.Item, { depth: null, colors: true });
      } else {
        console.log(`\nNo user found with ${keyName} = "${targetId}".`);
      }
    } else {
      // Fetch all users via Scan
      console.log(`Fetching all users from table "${TABLE_NAME}"...`);
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        console.log(`Table is currently empty (0 items found).`);
      } else {
        console.log(`Found ${result.Items.length} user(s):\n`);
        console.table(result.Items);
        console.log('\nFull JSON representation:');
        console.log(JSON.stringify(result.Items, null, 2));
      }
    }
  } catch (error) {
    console.error(`\nFailed to fetch from DynamoDB:`);
    console.error(error.message);
    if (error.name === 'AccessDeniedException') {
      console.error(`\nAccess Denied: Ensure your EC2 IAM Role has 'dynamodb:Scan', 'dynamodb:GetItem', and 'dynamodb:DescribeTable' permissions on the '${TABLE_NAME}' table.`);
    } else if (error.name === 'ResourceNotFoundException') {
      console.error(`\nTable "${TABLE_NAME}" does not exist in the configured region. Check your table name and AWS_REGION.`);
    }
  }
}

main();
