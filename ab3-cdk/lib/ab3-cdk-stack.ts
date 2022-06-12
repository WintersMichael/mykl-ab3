import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
//import * as appsync from '@aws-cdk/aws-appsync-alpha';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';

import productsData from '../products-test-data.json';
const region = 'us-west-2';

export class Ab3CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // DDB Products table
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

    // Cognito UserPool
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

    // Create UserPool user
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

    // AppSync
    const api = new appsync.CfnGraphQLApi(this, 'AB3Api', {
      name: 'AB3',
      authenticationType: 'API_KEY',
    });
    const apiSchema = new appsync.CfnGraphQLSchema(this, 'Schema', {
      apiId: api.attrApiId,
      definition: `
      type Product {
        id: ID!
        price: Float
        name: String
        description: String
        description_mobile: String
        aggregate_rating: Float
      }
      
      type Query {
        getAllProducts: [Product]
        getProduct(id: ID!): Product
      }
      
      schema {
        query: Query
      }
      `
    });
    const apiDDBRole = new iam.Role(this, "ApiDDB", {
      assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'), //TODO better policy
      ]
    });
    const apiDatasourceDDB = new appsync.CfnDataSource(this, "DDBDatasource", {
      apiId: api.attrApiId,
      name: 'ProductTable',
      type: 'AMAZON_DYNAMODB',
      serviceRoleArn: apiDDBRole.roleArn,
      dynamoDbConfig: {
        awsRegion: region,
        tableName: productsTable.tableName
      }
    });
    const resolverAllProducts = new appsync.CfnResolver(this, "AllProductsResolver", {
      apiId: api.attrApiId,
      dataSourceName: apiDatasourceDDB.name,
      typeName: 'Query',
      fieldName: 'getAllProducts',
      requestMappingTemplate: `
{
  "version": "2017-02-28",
  "operation": "Query",
  "query" : {
      "expression" : "id = :product",
      "expressionValues" : {
          ":product" : {"S": "product"}
      }
  },
}
      `,
      responseMappingTemplate: `
#set( $result = [] )
#foreach( $item in $ctx.result.items )
  $util.qr($result.add({
      "id": $item.sk,
      "price": $item.price,
      "name": $item.listing.name,
      "description": $item.listing.description,
      "description_mobile": $item.listing.description_mobile,
      "aggregate_rating": $item.listing.aggregate_rating
    }))
#end

$util.toJson($result)
      `
    });
    const resolverProductByID = new appsync.CfnResolver(this, "ResolverProductByID", {
      apiId: api.attrApiId,
      dataSourceName: apiDatasourceDDB.name,
      typeName: 'Query',
      fieldName: 'getProduct',
      requestMappingTemplate: `
{
  "version": "2017-02-28",
  "operation": "GetItem",
  "key" : {
    "id": {"S": "product"},
    "sk": $util.dynamodb.toDynamoDBJson($ctx.args.id)
  },
}
      `,
      responseMappingTemplate: `
$util.toJson({
  "id": $ctx.result.sk,
  "price": $ctx.result.price,
  "name": $ctx.result.listing.name,
  "description": $ctx.result.listing.description,
  "description_mobile": $ctx.result.listing.description_mobile,
  "aggregate_rating": $ctx.result.listing.aggregate_rating
})
      `
    });



    new CfnOutput(this, 'ProductsTableName', { value: productsTable.tableName });
    new CfnOutput(this, 'CognitoPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'CognitoClientId', { value: appClient.userPoolClientId });
    new CfnOutput(this, 'AppSyncURL', { value: api.attrGraphQlUrl });
  }
}
