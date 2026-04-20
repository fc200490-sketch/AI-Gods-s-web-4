import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { wrapFetchWithPayment, decodeXPaymentResponse } from 'x402-fetch';

const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:4000';

function log(...args) {
  console.error('[web4-mcp]', ...args);
}

let paidFetch = fetch;
let payerAddress = null;
if (process.env.PAYER_PRIVATE_KEY) {
  const account = privateKeyToAccount(process.env.PAYER_PRIVATE_KEY);
  payerAddress = account.address;
  const walletClient = createWalletClient({ account, transport: http(), chain: baseSepolia });
  paidFetch = wrapFetchWithPayment(fetch, walletClient);
  log(`x402 payer: ${payerAddress} on base-sepolia`);
} else {
  log('PAYER_PRIVATE_KEY not set — paid /invoke calls will fail with 402');
}

async function buildToolsFromRegistry() {
  const r = await fetch(`${REGISTRY_URL}/discover?sort=reputation`);
  if (!r.ok) throw new Error(`registry /discover failed: ${r.status}`);
  const services = await r.json();

  const tools = [];
  const routes = {};
  for (const s of services) {
    for (const cap of s.capabilities) {
      if (routes[cap.name]) continue;
      routes[cap.name] = { service: s, capability: cap };
      tools.push({
        name: cap.name,
        description: `[${s.name}] ${cap.description || cap.name} · ${s.pricing?.per_call ?? 0} ${s.pricing?.currency || 'USDC'}/call · reputation ${s.reputation_score?.toFixed(2) ?? '0.00'}`,
        inputSchema: cap.input_schema || { type: 'object', properties: {} },
      });
    }
  }
  return { tools, routes, serviceCount: services.length };
}

async function callCapability(route, input) {
  const url = `${route.service.endpoint}/invoke`;
  const t0 = Date.now();
  const r = await paidFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capability: route.capability.name, input }),
  });
  const elapsed = Date.now() - t0;
  const text = await r.text();
  if (!r.ok) throw new Error(`${route.capability.name} failed (${r.status}): ${text}`);
  const output = text ? JSON.parse(text) : {};
  let payment = null;
  const payHeader = r.headers.get('x-payment-response');
  if (payHeader) {
    try { payment = decodeXPaymentResponse(payHeader); } catch {}
  }
  return { output, payment, elapsed };
}

async function main() {
  const { tools, routes, serviceCount } = await buildToolsFromRegistry();
  log(`discovered ${serviceCount} services, exposing ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`);

  const server = new Server(
    { name: 'web4-agent', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: input } = request.params;
    const route = routes[name];
    if (!route) {
      return {
        isError: true,
        content: [{ type: 'text', text: `unknown tool: ${name}` }],
      };
    }
    try {
      const { output, payment, elapsed } = await callCapability(route, input || {});
      const payLine = payment
        ? `\n\n_Paid 0.001 USDC on ${payment.network}, tx ${payment.transaction} (${elapsed}ms)_`
        : `\n\n_Called in ${elapsed}ms (no payment)_`;
      return {
        content: [
          { type: 'text', text: JSON.stringify(output, null, 2) + payLine },
        ],
      };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: 'text', text: `error invoking ${name}: ${e.message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server ready on stdio');
}

main().catch((e) => {
  console.error('[web4-mcp] fatal:', e.message);
  process.exit(1);
});
