/// <reference path="./.sst/platform/config.d.ts" />

// Media Transfer telemetry: POST /v1/events -> DynamoDB (the record, never expires) -> PostHog.
// Own AWS member account `media-transfer` (588211236989), profile `media-transfer`, us-east-1.
// Stages: `dev` (raw execute-api URL) and `production` (media-transfer-api.buildsomethingeveryday.com).
export default $config({
  app(input) {
    return {
      name: "media-transfer-telemetry",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: input?.stage === "production",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
          profile: "media-transfer",
          defaultTags: {
            tags: {
              project: "media-transfer",
              "managed-by": "sst",
            },
          },
        },
      },
    };
  },
  async run() {
    $transform(sst.aws.Function, (args) => {
      args.runtime ??= "nodejs20.x";
    });
    const { cert } = await import("./infra/dns");
    const { table } = await import("./infra/database");
    const { api } = await import("./infra/api");
    return {
      ApiUrl: api.url,
      TableName: table.name,
      ...(cert ? { CertValidationRecords: cert.domainValidationOptions } : {}),
    };
  },
});
