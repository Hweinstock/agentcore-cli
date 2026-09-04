import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentialProvider: fromNodeProviderChain(),
});

export function loadModel() {
  return bedrock('global.anthropic.claude-sonnet-4-5-20250929-v1:0');
}
