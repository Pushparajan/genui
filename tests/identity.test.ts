import { it, expect } from 'vitest';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { OIDCIdentityService } from '@genui/policy-engine';
import type { IdentityBinding } from '@genui/marketing-core';
it('verifies issuer, audience, signature and expiry, then uses enrolled tenant grants rather than token roles',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256'); const jwk=await exportJWK(publicKey); jwk.kid='test';
  const config={id:'entra',issuer:'https://identity.example/tenant/v2.0',audience:'genui',jwksUrl:'https://identity.example/keys',algorithms:['RS256' as const]};
  const binding:IdentityBinding={issuer:config.issuer,subject:'external-user',principal:{id:'internal-user',tenantId:'tenant-a',roles:['marketer'],permissions:['crm.accounts.search']},identities:[{platform:'salesforce',subject:'sf-user',tenantId:'tenant-a'}],enabledPlatforms:['salesforce'],licenses:['salesforce.crm']};
  const service=new OIDCIdentityService([config],{async find(issuer,subject){return issuer===binding.issuer&&subject===binding.subject?binding:undefined;}},()=>createLocalJWKSet({keys:[jwk]}));
  const token=(audience='genui',expiry='5m',issuer=config.issuer)=>new SignJWT({roles:['admin']}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(issuer).setAudience(audience).setSubject('external-user').setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const context=await service.authenticate('entra',await token()); expect(context.principal.roles).toEqual(['marketer']); expect(context.principal.tenantId).toBe('tenant-a');
  for(const invalid of [await token('wrong'),await token('genui','-1s'),await token('genui','5m','https://attacker.example')]) await expect(service.authenticate('entra',invalid)).rejects.toMatchObject({code:'POLICY'});
  binding.identities[0].tenantId='tenant-b'; await expect(service.authenticate('entra',await token())).rejects.toMatchObject({code:'POLICY'});
});
