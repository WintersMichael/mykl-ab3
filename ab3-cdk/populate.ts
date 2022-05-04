console.log("ello");

const { DynamoDBClient, ListTablesCommand, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");

(async () => {
    const client = new DynamoDBClient({ region: "us-west-2" });
    const command = new ListTablesCommand({});
    const putCmd = new BatchWriteItemCommand({
        RequestItems: {
            ["Products"]: [
                {
                    PutRequest: {
                        Item: {
                            id: {S: "1"},
                            sk: {S: "product"}
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
                                    warning_en: {S: "Do not insult happy fun ball"}
                                }
                            }
                        }
                    }
                }
            ]
        }
    });
    try {
        // const results = await client.send(command);
        // console.log(results.TableNames.join("\n"));
        const results = await client.send(putCmd);
        console.log(results);

    } catch (err) {
        console.error(err);
    }
})();