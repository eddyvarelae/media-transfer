// The raw store: every accepted event, never expires (no TTL). On-demand billing (SST's default),
// point-in-time recovery on. pk installId, sk `<at>#<name>#<uuid>`.
export const table = new sst.aws.Dynamo("Events", {
  fields: {
    installId: "string",
    sk: "string",
  },
  primaryIndex: { hashKey: "installId", rangeKey: "sk" },
  transform: {
    table: {
      billingMode: "PAY_PER_REQUEST",
      pointInTimeRecovery: { enabled: true },
    },
  },
});
