import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { app } from '../src/app';

describe('Health and API Infrastructure Tests', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('1. GET /api/health returns HTTP 200 with service information (Process Liveness)', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      status: string;
      service: string;
      version: string;
      timestamp: string;
      uptimeSeconds: number;
    };

    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'adpayon-api');
    assert.equal(body.version, '1.0.0');
    assert.ok(body.timestamp);
    assert.equal(typeof body.uptimeSeconds, 'number');
  });

  it('2. GET /non-existent-route returns structured HTTP 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown-endpoint-test`);
    assert.equal(res.status, 404);

    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.ok(body.error.message.includes('Cannot GET /api/unknown-endpoint-test'));
  });

  it('3. GET /api/health/db returns HTTP 503 when disconnected and never leaks secrets (Readiness Probe)', async () => {
    const res = await fetch(`${baseUrl}/api/health/db`);

    // In local dev without live MongoDB Atlas connection, MUST return HTTP 503 degraded
    assert.equal(res.status, 503);

    const body = (await res.json()) as {
      status: string;
      service: string;
      database: string;
      message?: string;
    };

    assert.equal(body.status, 'degraded');
    assert.equal(body.service, 'adpayon-api');
    assert.equal(body.database, 'disconnected');
    assert.ok(body.message?.includes('currently unreachable'));

    // Critical security assertion: Ensure no credentials, MongoDB URLs, or passwords leak
    const payload = JSON.stringify(body);
    assert.ok(!payload.includes('mongodb'));
    assert.ok(!payload.includes('password'));
    assert.ok(!payload.includes('cluster'));
    assert.ok(!payload.includes('MONGODB_URI'));
  });
});
