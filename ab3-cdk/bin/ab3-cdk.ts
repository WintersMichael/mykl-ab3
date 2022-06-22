#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AB3BackendStack } from '../lib/ab3-backend-stack';
import { AB3FrontendStack } from '../lib/ab3-frontend-stack';

const region = process.env.CDK_DEFAULT_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-west-2";

//const env = { account: '250136343996', region: 'us-west-2' };
const env = { region: region };

const app = new cdk.App();
new AB3BackendStack(app, 'AB3BackendStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  env: env,

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

new AB3FrontendStack(app, 'AB3FrontendStack', {
  env: env
})