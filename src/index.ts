'use strict';

export interface Env {
  gyazo: R2Bucket;
}

const page = `
<!doctype html>
<link href="//fonts.googleapis.com/css?family=Sigmar+One:regular&v1" rel="stylesheet" type="text/css" >
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

  const parts = encoded.split("bytes=")[1]?.split("-") ?? [];
  if (parts.length !== 2) {
    throw new Error(
      "Not supported to skip specifying the beginning/ending byte at this time",
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
        "content-type": "text/html; charset=UTF-8",
      },
    },
  );
}


export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const objectName = url.pathname.slice(1, undefined);

    console.log(`${request.method} object ${objectName}: ${request.url}`);

    if (request.method === "GET" || request.method === "HEAD") {
      if (objectName === "") {
        return new Response(page, {
          headers: {
            "content-type": "text/html; charset=UTF-8",
          },
        });
      }

      if (request.method === "GET") {
        const range = parseRange(request.headers.get("range"));
        const object = await env.gyazo.get(objectName, {
          range,
          onlyIf: request.headers,
        });

        if (object === null) {
          return objectNotFound(objectName);
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
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
      headers.set("etag", object.httpEtag);
      return new Response(null, {
        headers,
      });
    }

    return new Response(`Unsupported method`, {
      status: 400,
    });
  },
};
