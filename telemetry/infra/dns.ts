// Production only: the API keeps a custom domain on Hostinger DNS
// (buildsomethingeveryday.com). The ACM cert is DNS-validated additively via the Hostinger API
// (scripts/dns.sh). Two deploys: first without the domain (prints the validation record), then,
// once the cert is ISSUED, with API_DOMAIN=on (API Gateway rejects pending certs).
export const API_DOMAIN = "media-transfer-api.buildsomethingeveryday.com";
export const PRODUCTION = $app.stage === "production";
export const DOMAIN_ENABLED = PRODUCTION && process.env.API_DOMAIN === "on";

export const cert = PRODUCTION
  ? new aws.acm.Certificate("Cert", { domainName: API_DOMAIN, validationMethod: "DNS" })
  : undefined;
