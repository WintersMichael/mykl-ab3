const { DynamoDBClient, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");

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