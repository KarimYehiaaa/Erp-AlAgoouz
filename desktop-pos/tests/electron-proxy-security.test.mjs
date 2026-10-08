import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const require = createRequire(new URL('../package.json', import.meta.url));
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
const getMetadata = builderRequire.resolve('@electron/get/package.json');
const getRequire = createRequire(getMetadata);

describe('Electron build proxy security', () => {
  it('resolves the reviewed upstream proxy without the vulnerable formatting dependency', () => {
    const proxy = JSON.parse(readFileSync(getRequire.resolve('global-agent/package.json'), 'utf8'));
    expect(proxy.version).toBe('4.1.3');
    expect(proxy.dependencies).not.toHaveProperty('roarr');
    expect(() => getRequire.resolve('sprintf-js')).toThrow();
  });

  it('the actual electron downloader initializes proxy routing and honors NO_PROXY', () => {
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
        import assert from 'node:assert/strict';
        import {createRequire} from 'node:module';
        for(const key of Object.keys(process.env)) {
          if(/^(?:GLOBAL_AGENT_)?(?:HTTP_PROXY|HTTPS_PROXY|NO_PROXY)$/i.test(key)) delete process.env[key];
        }
        const require=createRequire(${JSON.stringify(getMetadata)});
        const http=require('node:http');
        let proxyHits=0;
        const target=http.createServer((_req,res)=>res.end('direct'));
        const proxy=http.createServer((req,res)=>{
          proxyHits++;
          assert.ok(req.url.startsWith('http://127.0.0.1:'));
          res.end('proxied');
        });
        const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        const close=server=>new Promise(resolve=>server.close(resolve));
        const request=url=>new Promise((resolve,reject)=>{
          const req=http.get(url,res=>{
            let body=''; res.setEncoding('utf8');
            res.on('data',part=>body+=part); res.on('end',()=>resolve(body));
          });
          req.setTimeout(3000,()=>req.destroy(new Error('Fixture request timed out')));
          req.on('error',reject);
        });
        try {
          await listen(target); await listen(proxy);
          process.env.GLOBAL_AGENT_HTTP_PROXY='http://127.0.0.1:'+proxy.address().port;
          process.env.GLOBAL_AGENT_HTTPS_PROXY=process.env.GLOBAL_AGENT_HTTP_PROXY;
          process.env.GLOBAL_AGENT_NO_PROXY='';
          require('@electron/get').initializeProxy();
          const url='http://127.0.0.1:'+target.address().port+'/fixture';
          assert.equal(await request(url),'proxied');
          assert.equal(proxyHits,1);
          globalThis.GLOBAL_AGENT.NO_PROXY='127.0.0.1';
          assert.equal(await request(url),'direct');
          assert.equal(proxyHits,1);
          console.log('electron-proxy-fixture-passed');
        } finally {
          globalThis.GLOBAL_AGENT && (globalThis.GLOBAL_AGENT.HTTP_PROXY=null);
          target.closeAllConnections(); proxy.closeAllConnections();
          await close(target); await close(proxy);
        }
      `,
      ],
      { encoding: 'utf8', timeout: 15000 },
    );
    expect(child.error).toBeUndefined();
    expect(child.status, child.stdout + child.stderr).toBe(0);
    expect(child.stdout).toContain('electron-proxy-fixture-passed');
  });
});
