import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';

import productsData from '../products-test-data.json';

export class Ab3CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // Create Products table
    const productsTable = new dynamodb.Table(this, 'AB3ProductsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
    });
    productsTable.addLocalSecondaryIndex({
        indexName: 'category-index',
        sortKey: {
          name: 'category',
          type: dynamodb.AttributeType.STRING
        }
    });
    productsTable.addLocalSecondaryIndex({
      indexName: 'price-index',
      sortKey: {
        name: 'price',
        type: dynamodb.AttributeType.NUMBER
      }
    });

    // Populate products table with test data.  
    const batchWriteCommand: any = { "RequestItems": {} }; //BatchWriteItem syntax + TS makes this a pain.
    batchWriteCommand.RequestItems[productsTable.tableName] = productsData;
    const customPopulateDDB = new AwsCustomResource(this, 'customPopulateDDB', {
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      logRetention: logs.RetentionDays.ONE_WEEK,
      onCreate: {
        physicalResourceId: PhysicalResourceId.of('initProductsData'),
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: batchWriteCommand
      }
    });
    //customPopulateDDB.node.addDependency(productsTable);

    // Create Cognito UserPool
    const userPool = new cognito.UserPool(this, 'AB3UserPool', {
      accountRecovery: cognito.AccountRecovery.NONE,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireSymbols: false
      },
      signInAliases: {
        username: true,
        email: false,
        phone: false,
        preferredUsername: false
      },
      signInCaseSensitive: false,
    });
    const appClient = new cognito.UserPoolClient(this, 'AB3AppClient', {
      userPool: userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: true
      },
      preventUserExistenceErrors: true
    });

    // Create user
    const username = 'auser';
    const password = 'aoeuaoeu';
    const customCreateUser = new AwsCustomResource(this, 'customCreateUser', {
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      logRetention: logs.RetentionDays.ONE_WEEK,
      onCreate: {
        physicalResourceId: PhysicalResourceId.of('customCreateUser'),
        service: 'CognitoIdentityServiceProvider',
        action: 'adminCreateUser',
        parameters: {
          Username: 'auser', // Temp password will be auto-generated and then changed below
          UserAttributes: [
            {
              Name: "name",
              Value: "Andrew User"
            }
          ],
          MessageAction: 'SUPPRESS',
          UserPoolId: userPool.userPoolId
        }
      }
    });
    const customSetUserPassword = new AwsCustomResource(this, 'customSetUserPassword', {
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      logRetention: logs.RetentionDays.ONE_WEEK,
      onCreate: {
        physicalResourceId: PhysicalResourceId.of('customSetUserPassword'),
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          Username: username,
          Password: password,
          Permanent: true,
          UserPoolId: userPool.userPoolId
        }
      }
    });
    customSetUserPassword.node.addDependency(customCreateUser);



    new CfnOutput(this, 'ProductsTableName', { value: productsTable.tableName });
    new CfnOutput(this, 'CognitoPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'CognitoClientId', { value: appClient.userPoolClientId });
  }
}
