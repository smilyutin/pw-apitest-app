import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import { accessToken } from '../../../utils/token';

const API = 'https://conduit-api.bondaracademy.com';
const SOFT = process.env.SECURITY_SOFT === '1';

// Soft assertion helper
function expectSoft(ok: boolean, msg: string) {
  if (!ok) {
    if (SOFT) console.warn('⚠️ [soft] ' + msg);
    else throw new Error(msg);
  }
}

// Tiny helper to create “files” for multipart
function file(name: string, mimeType: string, content: string | Buffer) {
  return { name, mimeType, buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) };
}

// Try to find a plausible upload endpoint; skip if none found
async function detectUploadEndpoint(ctx: APIRequestContext): Promise<string | null> {
  const candidates = [
    '/api/upload',
    '/api/uploads',
    '/api/files',
    '/api/images',
    '/api/user/avatar',
    '/api/user/photo',
    '/api/profile/avatar',
  ];

  for (const path of candidates) {
    // Probe with a harmless, tiny multipart request
    const res = await ctx.post(path, {
      headers: { Authorization: `Token ${accessToken}` },
      multipart: {
        file: file('probe.txt', 'text/plain', 'probe'),
      },
    });

    // Accept anything that is not a plain 404/405 with empty body;
    // many APIs will respond 4xx (missing extra fields), which is fine—we just need the route to exist.
    if (![404].includes(res.status())) {
      console.log(`🔍 Upload candidate "${path}" responded ${res.status()}`);
      return path;
    }
  }
  return null;
}

async function newApi() {
  return await pwRequest.newContext({ baseURL: API });
}

test.describe('[security] File upload: content-type, extension & path traversal', () => {
  test('Server rejects or safely normalizes dangerous filenames and types', async () => {
    const ctx = await newApi();

    const endpoint = await detectUploadEndpoint(ctx);
    test.skip(!endpoint, 'No upload endpoint detected — skipping file upload hardening checks.');
    if (!endpoint) {
      await ctx.dispose();
      return;
    }

    // Suspicious files to try
    const cases = [
      {
        name: '../../../../../etc/passwd', // path traversal attempt
        mime: 'image/png',
        body: 'PNG', // tiny stub
        expectReject: true,
        why: 'Path traversal in filename should be rejected or normalized.',
      },
      {
        name: '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts', // Windows-style traversal
        mime: 'image/png',
        body: 'PNG',
        expectReject: true,
        why: 'Windows path traversal should be rejected or normalized.',
      },
      {
        name: 'avatar.jpg.php', // double extension
        mime: 'image/jpeg',
        body: 'JPEG',
        expectReject: true,
        why: 'Double extensions that end with executable types should be rejected or stored with safe server-side name.',
      },
      {
        name: 'payload.svg',
        mime: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg"><script>window.x=1</script></svg>`,
        expectReject: true,
        why: 'SVG with script should be rejected or sanitized server-side.',
      },
      {
        name: 'binary.exe',
        mime: 'application/octet-stream',
        body: 'MZ\x90\x00', // PE header-ish
        expectReject: true,
        why: 'Generic binary uploads should be rejected unless explicitly allowed.',
      },
      {
        name: 'nice.png',
        mime: 'image/png',
        body: 'PNG', // a benign control
        expectReject: false,
        why: 'A benign image should be accepted if uploads are supported.',
      },
    ];

    for (const c of cases) {
      const res = await ctx.post(endpoint, {
        headers: { Authorization: `Token ${accessToken}` },
        multipart: { file: file(c.name, c.mime, c.body) },
      });

      const status = res.status();
      const text = await res.text().catch(() => '');
      console.log(`🧪 ${c.name} [${c.mime}] → ${status} ${text.slice(0, 120)}`);

      if (c.expectReject) {
        // Consider 400/401/403/415/422 as good rejections
        const rejected = [400, 401, 403, 415, 422].includes(status);
        // Some APIs will accept but normalize filename and return a safe URL; allow 200/201 if response looks sanitized.
        const maybeAcceptsButSanitizes =
          [200, 201].includes(status) &&
          !/(\.\.|\/|\\)/.test(text) && // do not reflect traversal in body/url
          !/\.php\b/i.test(text);

        expectSoft(
          rejected || maybeAcceptsButSanitizes,
          `Dangerous upload "${c.name}" not properly rejected/sanitized (status=${status}).`
        );
      } else {
        expectSoft(
          [200, 201].includes(status),
          `Benign upload "${c.name}" was unexpectedly rejected (status=${status}).`
        );
      }
    }

    await ctx.dispose();
  });

  test('Returned URLs (if any) must not include traversal or executable extensions', async () => {
    const ctx = await newApi();

    const endpoint = await detectUploadEndpoint(ctx);
    test.skip(!endpoint, 'No upload endpoint detected — skipping returned-URL checks.');
    if (!endpoint) {
      await ctx.dispose();
      return;
    }

    // Try a benign upload and parse a returned URL if present
    const res = await ctx.post(endpoint, {
      headers: { Authorization: `Token ${accessToken}` },
      multipart: { file: file('ok.png', 'image/png', 'PNG') },
    });

    const status = res.status();
    const bodyText = await res.text().catch(() => '');
    let url: string | null = null;

    // Try to extract URL from JSON or string
    try {
      const json = JSON.parse(bodyText);
      url = json.url || json.location || json.href || null;
    } catch {
      const m = bodyText.match(/https?:\/\/[^\s"'<>]+/i);
      url = m ? m[0] : null;
    }

    console.log(`🔗 upload status=${status}; url=${url ?? '(none)'}`);

    // If the API returns a URL, sanity-check it
    if (url) {
      expectSoft(!url.includes('..') && !/[\\]/.test(url), 'Returned URL contains traversal characters.');
      expectSoft(!/\.php(\?|$)/i.test(url), 'Returned URL ends with .php (executable).');

      // Optional: HEAD the URL and verify safe content-type
      const head = await ctx.fetch(url, { method: 'HEAD' }).catch(() => null);
      if (head) {
        const ct = head.headers()['content-type'] || '';
        expectSoft(
          /image\/(png|jpeg|gif|webp|svg\+xml)/i.test(ct),
          `Returned file content-type looks unsafe/unknown: "${ct}"`
        );
      }
    } else {
      // No URL returned is fine (some APIs just store and return an id).
      expectSoft(true, 'API did not return a URL (OK if by design).');
    }

    await ctx.dispose();
  });
});