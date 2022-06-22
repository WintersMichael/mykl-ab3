#!/bin/bash
set -e

echo Installing CDK ...
cd ab3-cdk
npm install
echo
echo Deploying AB3 backend ...
cdk deploy --outputs-file ../anyco/src/cdkOutput.json --require-approval never AB3BackendStack

echo
echo Installing app dependencies ...
cd ../anyco
npm install
echo
echo Building app ...
npm run build

echo Deploying AB3 frontend...
cd ../ab3-cdk
cdk deploy --require-approval never AB3FrontendStack