import { Stack, StackProps, CfnOutput} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cforigins from 'aws-cdk-lib/aws-cloudfront-origins';


export class AB3FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    //App deployment
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      accessControl: s3.BucketAccessControl.PRIVATE,
    });
    const websiteDeployment = new s3deployment.BucketDeployment(this, 'WebsiteDeployment', {
      sources: [s3deployment.Source.asset('../anyco/build')],
      destinationBucket: websiteBucket
    });

    const accessIdentity = new cloudfront.OriginAccessIdentity(this, 'AccessIdentity', {

    });
    websiteBucket.grantRead(accessIdentity);

    const cfDistribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new cforigins.S3Origin(websiteBucket, {
          originAccessIdentity: accessIdentity
        }),
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED
      },
    });

    new CfnOutput(this, 'WebsiteURL', { value: 'https://' + cfDistribution.distributionDomainName + '/' });
  }
}