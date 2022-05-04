import { Stack, StackProps, } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class Ab3CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    const productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: 'Products',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
    });
    productsTable.addGlobalSecondaryIndex({
        indexName: 'CategoryPrice',
        partitionKey: {
          name: 'category',
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: 'price',
          type: dynamodb.AttributeType.STRING
        }
    })
  }
}
