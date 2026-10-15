import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { MarketingError, type IdentityStore, type CapabilityContext } from '@genui/marketing-core';
export { PolicyEngine } from '@genui/marketing-core';
export interface OIDCProviderConfig {
  id: string; issuer: string; audience: string; jwksUrl: string;
  algorithms: ('RS256' | 'ES256')[];
}
/** Accepts tokens from configured federated issuers; grants come from trusted identity mappings, never token roles. */
export class OIDCIdentityService {
  private providers = new Map<string, { config: OIDCProviderConfig; key: JWTVerifyGetKey }>();
  constructor(configs: OIDCProviderConfig[], private store: IdentityStore, keyResolver?: (config: OIDCProviderConfig) => JWTVerifyGetKey) {
    for (const config of configs) {
      const jwks = new URL(config.jwksUrl); const issuer = new URL(config.issuer);
      if (jwks.protocol !== 'https:' || issuer.protocol !== 'https:' || jwks.username || jwks.password || !config.algorithms.length || config.algorithms.some(a => !['RS256','ES256'].includes(a)) || this.providers.has(config.id)) throw new MarketingError('POLICY', 'Invalid OIDC provider configuration');
      this.providers.set(config.id, { config, key: keyResolver ? keyResolver(config) : createRemoteJWKSet(jwks) });
    }
  }
  async authenticate(providerId: string, bearer: string): Promise<CapabilityContext> {
    const provider = this.providers.get(providerId); if (!provider) throw new MarketingError('POLICY', 'Unknown identity provider');
    let subject: string;
    try {
      const { payload } = await jwtVerify(bearer, provider.key, { issuer: provider.config.issuer, audience: provider.config.audience, algorithms: provider.config.algorithms, requiredClaims: ['exp','iat','sub'] });
      if (!payload.sub) throw new Error(); subject = payload.sub;
    } catch { throw new MarketingError('POLICY', 'Identity token verification failed'); }
    const binding = await this.store.find(provider.config.issuer, subject);
    if (!binding || binding.issuer !== provider.config.issuer || binding.subject !== subject || !binding.principal.tenantId || binding.identities.some(i => i.tenantId !== binding.principal.tenantId)) throw new MarketingError('POLICY', 'Identity is not enrolled in a tenant');
    return { principal: structuredClone(binding.principal), identities: structuredClone(binding.identities), enabledPlatforms: [...binding.enabledPlatforms], licenses: [...binding.licenses], correlationId: randomUUID() };
  }
}
