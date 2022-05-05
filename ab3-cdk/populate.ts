const { DynamoDBClient, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");

(async () => {
    const client = new DynamoDBClient({ region: "us-west-2" });
    const putCmd = new BatchWriteItemCommand({
        RequestItems: {
            ["Products"]: [
                {
                    PutRequest: {
                        Item: {
                            id: {S: "1"},
                            sk: {S: "product"},
                            price: {N: "19.95"},
                            category: {S: "Toys"},
                            name: {S: "Super Happy Crazy Bouncing Fun Ball"},
                            description: {S: "Buy Now!"}
                        }
                    }
                },
                {
                    PutRequest: {
                        Item: {
                            id: {S: "1"},
                            sk: {S: "warnings"},
                            warnings: {
                                M: {
                                    warning_en: {S: "Do not insult happy fun ball."}
                                }
                            }
                        }
                    }
                }
            ]
        }
    });
    try {
        const results = await client.send(putCmd);
        console.log(results);
    } catch (err) {
        console.error(err);
    }
})();