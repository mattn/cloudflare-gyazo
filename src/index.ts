'use strict';

export interface Env {
  gyazo: R2Bucket;
  GYAZO_USERNAME: string;
  GYAZO_PASSWORD: string;
}

const page = `
<!doctype html>
<link href="//fonts.bunny.net/css?family=sigmar-one:400" rel="stylesheet" />
<meta charset="utf-8" />
<title>Cloudflare Gyazo</title>
<style>
body {
  font-size: 40px;
  text-align: center;
}
h1,h2,h3 {
  font-family: 'Sigmar One', serif;
  font-style: normal;
  text-shadow: none;
  text-decoration: none;
  text-transform: none;
  letter-spacing: -0.05em;
  word-spacing: 0em;
  line-height: 1.15;
}
</style>
<body>
	<h1>Cloudflare Gyazo</h1>
	2022 (C) <a href="http://mattn.kaoriya.net/">mattn</a>, code is <a href="https://github.com/mattn/cloudflare-gyazo">here</a>
</body>
`

function parseRange(
  encoded: string | null,
): undefined | { offset: number; length: number } {
  if (encoded === null) {
    return;
  }

  const parts = encoded.split('bytes=')[1]?.split('-') ?? [];
  if (parts.length !== 2) {
    throw new Error(
      'Not supported to skip specifying the beginning/ending byte at this time',
    );
  }

  return {
    offset: Number(parts[0]),
    length: Number(parts[1]) + 1 - Number(parts[0]),
  };
}

function objectNotFound(objectName: string): Response {
  return new Response(
    `<html><body>R2 object "<b>${objectName}</b>" not found</body></html>`,
    {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
      },
    },
  );
}

function basicAuthentication(request: Request) {
  const authorization = request.headers.get('Authorization')!;
  const [scheme, encoded] = authorization.split(' ');
  if (!encoded || scheme !== 'Basic') {
    throw new Error('Malformed authorization header.')
  }
  const decoded = atob(encoded).normalize()
  const index = decoded.indexOf(':')
  if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
    throw new Error('Invalid authorization value.')
  }
  return {
    username: decoded.substring(0, index),
    password: decoded.substring(index + 1),
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const { protocol, hostname, pathname } = new URL(request.url);
    const objectName = pathname.slice(1, undefined);

    if ('https:' !== protocol || 'https' !== request.headers.get('x-forwarded-proto')) {
      throw new Error('Please use a HTTPS connection.')
    }

    console.log(`${request.method} object ${objectName}: ${request.url}`);

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (objectName === '') {
        return new Response(page, {
          headers: {
            'content-type': 'text/html; charset=UTF-8',
          },
        });
      }

      if (request.method === 'GET') {
        const range = parseRange(request.headers.get('range'));
        const object = await env.gyazo.get(objectName, {
          range,
          onlyIf: request.headers,
        });

        if (object === null) {
          return objectNotFound(objectName);
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        const status = (<R2ObjectBody>object).body ? (range ? 206 : 200) : 304;
        return new Response((<R2ObjectBody>object).body, {
          headers,
          status,
        });
      }

      const object = await env.gyazo.head(objectName);
      if (object === null) {
        return objectNotFound(objectName);
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      return new Response(null, {
        headers,
      });
    } else if (request.method === 'POST') {
      if (request.headers.has('Authorization')) {
        const { username, password } = basicAuthentication(request)
        if (username === env.GYAZO_USERNAME && password === env.GYAZO_PASSWORD) {
          const formData = await request.formData()
          const file = formData.get('imagedata');
          const contents = await (<Blob>file).arrayBuffer();
          const bytes = new Uint8Array(await crypto.subtle.digest(
            {
              name: 'SHA-1',
            },
            contents,
          ));
          let hash = '';
          for (let i = 0; i < 8; i++) {
            let value = bytes[i].toString(16);
            hash += (value.length === 1 ? '0' + value : value);
          }
          const name = hash + '.png';
          const headers = new Headers();
          headers.set('content-type', 'image/png');
          const object = await env.gyazo.put(name, contents, {
            httpMetadata: headers,
          })
          return new Response('https://' + hostname + '/' + name, {
            headers: {
              'etag': object.httpEtag,
            }
          })
        }
      }
      return new Response(
        'Not Authenticated',
        {
          status: 401,
          headers: {
            'content-type': 'text/plain; charset=UTF-8',
            'accept-charset': 'utf-8',
            'www-authenticate': 'Basic realm="Enter username and password.'
          },
        },
      );
    }

    return new Response(`Unsupported method`, {
      status: 400,
    });
  },
};
