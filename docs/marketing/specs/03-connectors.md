# 03 · Connector SDK and MCP gateway

`defineConnector` validates a manifest containing identity/version, supported API versions, transport endpoint, OAuth scopes, rate limits and capability/tool mappings. Mappings include input/output JSON Schemas, effects, approval requirements, feature prerequisites, pagination and idempotency. Schemas are compiled before registration. A host trust policy explicitly lists connector IDs and exact credential-free HTTPS endpoints. Fixtures need explicit opt-in. Redirects are rejected by built-in HTTP/MCP transports. Deploy network egress controls as defense in depth.

`bindConnector` discovers tools and rejects missing tools or input/output schema drift. Remote descriptions/annotations never establish policy or enter model prompts. Capability provider execution checks tenant identity, permission, license, rate limit and input/output schemas. The host creates a gateway per authenticated tenant scope; MCP clients are also pinned to the exact authenticated principal. Do not reuse an authenticated client across users.

`MCPConnectorTransport` uses official SDK v2 `Client` and `StreamableHTTPClientTransport`, bounded discovery pagination, a timeout and structured results. It passes correlation/idempotency metadata, which does not imply that a server honors idempotency. The core does not trust remote requests for sampling or grant additional credentials. Test servers use the official server package and in-memory transport, so protocol negotiation is exercised.

`HttpConnectorTransport` wraps fixed REST operations or GraphQL documents; callers cannot supply arbitrary URLs or query documents. `createVendorConnector` binds a licensed SDK or a custom normalized API function to an Adobe/Salesforce/custom contract. The endpoint/version/tool mappings must be verified by the connector author. For MCP-native services, use discovered actual tool names and exact schemas in a custom manifest. For vendor APIs, map both requests and results explicitly.

```ts
const { manifest, transport } = createVendorConnector({
  connectorId: 'adobe-aem', endpoint: configuredEndpoint,
  apiVersion: configuredApiVersion, transport: 'rest', scopes: configuredScopes
}, async (tool, input, context, idempotencyKey) => {
  // Call your supported AEM API/SDK with credentials from the secret service.
  // Normalize its response to the declared output contract, including id.
  return licensedAemAdapter.invoke(tool, input, context, idempotencyKey);
});
const providers = await gateway.register(manifest, transport);
```

`certifyConnector` runs explicit sandbox samples through the same governed boundary and reports pass/failure codes. Writes require `allowWrites=true`; use isolated vendor sandboxes. This harness is a contract check, not a security accreditation. Connector code and supplied auth callbacks are trusted application code and must be reviewed. Never serialize tokens into manifests, metadata or model context.
