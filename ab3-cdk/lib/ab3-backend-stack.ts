import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deployment from 'aws-cdk-lib/aws-s3-deployment';

import productsData from '../products-test-data.json';
const region = 'us-west-2';

export class AB3BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // DDB Products table
    const productsTable = new dynamodb.Table(this, 'AB3ProductsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      removalPolicy: RemovalPolicy.DESTROY
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
    const apiKey = new appsync.CfnApiKey(this, "AB3ApiKey", {
      apiId: api.attrApiId,
      expires: Math.floor(new Date().getTime() / 1000) + (86400 * 364) //today + 1yr
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
        img_mobile: String
        img: String
        aggregate_rating: Float
        reviews: [Review]
      }
      
      type Review {
        id: ID!
        username: String
        rating: Float
        comment: String
      }
      
      type Query {
        getAllProducts: [Product]
        getProduct(id: ID!): Product
        getReviewsByProduct(id: ID!): [Review]
      }
      
      schema {
        query: Query
      }
      `
    });
    //Data Sources
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
    // Resolvers
    const resolverAllProducts = new appsync.CfnResolver(this, "ResolverAllProducts", {
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
      "img": $item.listing.img,
      "img_mobile": $item.listing.img_mobile,
      "aggregate_rating": $item.listing.aggregate_rating
    }))
#end
$util.toJson($result)
      `
    });
    resolverAllProducts.addDependsOn(apiSchema);
    resolverAllProducts.addDependsOn(apiDatasourceDDB);
    const resolverGetProduct = new appsync.CfnResolver(this, "ResolverGetProduct", {
      apiId: api.attrApiId,
      dataSourceName: apiDatasourceDDB.name,
      typeName: 'Query',
      fieldName: 'getProduct',
      requestMappingTemplate: `
#set( $pid = "P#$ctx.args.id" )
{
  "version": "2017-02-28",
  "operation": "GetItem",
  "key" : {
    "id": {"S": "product"},
    "sk": $util.dynamodb.toDynamoDBJson($pid)
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
  "img": $ctx.result.listing.img,
  "img_mobile": $ctx.result.listing.img_mobile,
  "aggregate_rating": $ctx.result.listing.aggregate_rating
})
      `
    });
    resolverGetProduct.addDependsOn(apiSchema);
    resolverGetProduct.addDependsOn(apiDatasourceDDB);
    const resolverProductReviews = new appsync.CfnResolver(this, "ResolverProductReviews", {
      apiId: api.attrApiId,
      dataSourceName: apiDatasourceDDB.name,
      typeName: 'Product',
      fieldName: 'reviews',
      requestMappingTemplate: `
{
  "version": "2017-02-28",
  "operation": "Query",
  "query" : {
      "expression" : "id = :product_id AND begins_with(sk, :r)",
      "expressionValues" : {
          ":product_id" :  $util.dynamodb.toDynamoDBJson($ctx.source.id),
          ":r" : {"S": "R"}
      }
  },
}
      `,
      responseMappingTemplate: `
#set( $result = [] )
#foreach( $item in $ctx.result.items )
  $util.qr($result.add({
      "id": $item.sk,
      "username": $item.review.username,
      "rating": $item.review.rating,
      "comment": $item.review.comment
    }))
#end
$util.toJson($result)
      `
    });
    resolverProductReviews.addDependsOn(apiSchema);
    resolverProductReviews.addDependsOn(apiDatasourceDDB);
    const resolverReviewsByProduct = new appsync.CfnResolver(this, "ResolverReviewsByProduct", {
      apiId: api.attrApiId,
      dataSourceName: apiDatasourceDDB.name,
      typeName: 'Query',
      fieldName: 'getReviewsByProduct',
      requestMappingTemplate: `
{
  "version": "2017-02-28",
  "operation": "Query",
  "query" : {
      "expression" : "id = :product_id AND begins_with(sk, :r)",
      "expressionValues" : {
        ":product_id" :  $util.dynamodb.toDynamoDBJson("P#\${ctx.args.id}"),
          ":r" : {"S": "R"}
      }
  },
}
      `,
      responseMappingTemplate: `
#set( $result = [] )
#foreach( $item in $ctx.result.items )
  $util.qr($result.add({
      "id": $item.sk,
      "username": $item.review.username,
      "rating": $item.review.rating,
      "comment": $item.review.comment
    }))
#end
$util.toJson($result)
      `
    });
    resolverReviewsByProduct.addDependsOn(apiSchema);
    resolverReviewsByProduct.addDependsOn(apiDatasourceDDB);





    new CfnOutput(this, 'ProductsTableName', { value: productsTable.tableName });
    new CfnOutput(this, 'CognitoPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'CognitoClientId', { value: appClient.userPoolClientId });
    new CfnOutput(this, 'AppSyncURL', { value: api.attrGraphQlUrl });
    new CfnOutput(this, 'AppSyncKeyID', { value: apiKey.attrApiKey });
  }
}
