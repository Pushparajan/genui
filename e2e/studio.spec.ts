import { test, expect } from '@playwright/test';
test('marketing Studio plans, prepares, approves, activates and shows audit history',async({page})=>{
  const pageErrors:string[]=[]; page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:5174');
  await expect(page.getByRole('heading',{name:'One campaign. Every platform.'})).toBeVisible();
  await expect(page.getByText('Reference workspace with simulated')).toBeVisible();
  const create=page.getByRole('button',{name:'Create campaign plan'}); await expect(create).toBeDisabled();
  await page.getByLabel('Campaign name',{exact:true}).fill('Browser finance campaign');
  await page.getByLabel('I have verified consent').check(); await page.getByLabel('I have verified account eligibility').check();
  await create.click(); await expect(page.getByTestId('run-status')).toHaveText('pending');
  await page.getByRole('button',{name:'Run next stages'}).click(); await expect(page.getByTestId('run-status')).toHaveText('awaiting_approval');
  await page.getByRole('button',{name:'Approvals',exact:true}).click();
  await page.getByRole('button',{name:'Approve activation as demo reviewer'}).first().click();
  await expect(page.getByTestId('run-status')).toHaveText('completed');
  await expect(page.getByText('Campaign lifecycle completed using fixture providers.')).toBeVisible();
  await page.getByRole('button',{name:'Audit & Identity'}).click(); await expect(page.getByRole('cell',{name:'approval.granted',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Connectors',exact:true}).click(); await page.getByRole('button',{name:'Inspect manifest'}).first().click();
  await page.getByRole('button',{name:'Validate manifest',exact:true}).click(); await expect(page.getByRole('status')).toContainText('Not registered.');
  await page.getByRole('button',{name:'Dynamic Forms',exact:true}).click(); await expect(page.getByRole('heading',{name:'Retrieve eligible target accounts'})).toBeVisible();
  await page.getByRole('button',{name:'Dashboards',exact:true}).click(); await expect(page.getByText('24,000')).toBeVisible();
  await page.getByRole('button',{name:'Chat',exact:true}).click();
  await page.getByLabel('Campaign request').fill('Create a finance campaign for the top 10 accounts');
  await page.getByRole('button',{name:'Propose campaign plan'}).click(); await expect(page.getByText('Prepared a 7-stage plan for 10 eligible finance accounts.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Review proposed plan'}).click(); await expect(page.getByTestId('run-status')).toHaveText('pending');
  expect(pageErrors).toEqual([]);
});
test('Studio API rejects missing consent and invalid approval',async({request})=>{
  const invalid=await request.post('http://127.0.0.1:5174/api/plan',{data:{name:'x',consentVerified:false,eligibilityVerified:true}}); expect(invalid.status()).toBe(400);
  const missing=await request.post('http://127.0.0.1:5174/api/approve',{data:{id:'not-a-workflow'}}); expect(missing.status()).toBe(403);
});

test('rejected activation cannot execute',async({request})=>{
  const created=await request.post('http://127.0.0.1:5174/api/plan',{data:{name:'Rejected campaign',consentVerified:true,eligibilityVerified:true}}); const run=await created.json();
  const prepared=await request.post('http://127.0.0.1:5174/api/resume',{data:{id:run.id}}); expect((await prepared.json()).status).toBe('awaiting_approval');
  const rejected=await request.post('http://127.0.0.1:5174/api/reject',{data:{id:run.id}}); expect((await rejected.json()).status).toBe('rejected');
  const resumed=await request.post('http://127.0.0.1:5174/api/resume',{data:{id:run.id}}); const result=await resumed.json(); expect(result.status).toBe('rejected'); expect(result.steps['marketing.journey.activate'].attempts).toBe(0);
});

test('RAG UI retrieves a cited view, changes with intent, and validates without execution',async({page,request})=>{
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button',{name:'RAG UI',exact:true}).click();
  await page.getByLabel('UI request',{exact:true}).fill('Retrieve eligible target accounts');
  await page.getByRole('button',{name:'Generate grounded UI'}).click();
  await expect(page.getByTestId('rag-binding')).toContainText('crm.accounts.search @ 1.0.0');
  await expect(page.getByTestId('rag-citations')).toContainText('system.crm.accounts.search');
  await page.getByLabel('industry',{exact:true}).fill('Finance');
  await page.getByLabel('limit',{exact:true}).fill('20');
  await page.getByLabel('consentVerified',{exact:true}).check();
  await page.getByLabel('eligibilityVerified',{exact:true}).check();
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Inputs validated. No provider operation executed.');
  await page.getByLabel('UI request',{exact:true}).fill('Activate reviewed journey');
  await page.getByRole('button',{name:'Generate grounded UI'}).click();
  await expect(page.getByTestId('rag-binding')).toContainText('marketing.journey.activate @ 1.0.0');
  await expect(page.getByText('This capability requires human approval before execution.',{exact:false})).toBeVisible();
  const tampered=await request.post('http://127.0.0.1:5174/v1/ui/validate',{data:{capabilityId:'marketing.journey.activate',capabilityVersion:'invented',input:{journeyId:'x'}}});expect(tampered.status()).toBe(403);
  const crossTenant=await request.post('http://127.0.0.1:5174/v1/retrieval/search',{data:{query:'accounts',tenantId:'other'}});expect(crossTenant.status()).toBe(400);
});

test('conversation seeds preview all scenarios without creating workflows or granting approvals',async({page,request})=>{
  const before=await (await request.get('http://127.0.0.1:5174/api/runs')).json();
  const catalog=await (await request.get('http://127.0.0.1:5174/api/conversation-seeds')).json();
  expect(catalog.fixtureOnly).toBe(true);expect(catalog.scenarios).toHaveLength(31);expect(catalog.walkthroughs[0].messageCount).toBe(40);
  await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Chat',exact:true}).click();
  await page.getByRole('button',{name:'Preview seed conversation',exact:true}).click();
  const preview=page.getByTestId('seed-preview');await expect(preview.getByRole('heading',{name:'Finance activation walkthrough'})).toBeVisible();
  await expect(preview.getByText('Audience plan prepared:',{exact:false})).toContainText('412 unique contacts');
  await page.getByRole('combobox',{name:'Conversation example',exact:true}).selectOption('scenario-INT-17');await page.getByRole('button',{name:'Preview seed conversation',exact:true}).click();
  await expect(preview.getByText('Send it.',{exact:true})).toBeVisible();await expect(preview.getByText('Simulated activation accepted',{exact:false})).toContainText('Nothing was actually sent');
  const after=await (await request.get('http://127.0.0.1:5174/api/runs')).json();expect(after).toEqual(before);
  const unknown=await request.get('http://127.0.0.1:5174/api/conversation-seeds/unknown');expect(unknown.status()).toBe(404);
  const fakeApproval=await request.post('http://127.0.0.1:5174/api/approve',{data:{id:'seed-finance-plan'}});expect(fakeApproval.status()).toBe(403);
  await page.getByRole('button',{name:'Clear seed preview',exact:true}).click();await expect(preview).toHaveCount(0);
});
