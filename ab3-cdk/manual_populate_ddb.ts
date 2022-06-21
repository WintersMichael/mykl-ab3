const { DynamoDBClient, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");

/**
 * This is a utility script to populate an arbitrary DDB table with the testing data,
 * mainly for development. `node manual_populate_ddb.ts`
 */

import productsData from './products-test-data.json';
(async () => {
    const client = new DynamoDBClient({ region: "us-west-2" });
    const putCmd = new BatchWriteItemCommand({
        "RequestItems": {
          "Products": productsData
        }
    });
    try {
        const results = await client.send(putCmd);
        console.log(results);
    } catch (err) {
        console.error(err);
    }
})();