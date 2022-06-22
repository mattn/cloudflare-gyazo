export interface Env {
    gyazo: R2Bucket;
}

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
                return new Response("Hello", {
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
