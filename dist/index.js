import { DurableObject } from "cloudflare:workers";
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Starbase-Source, X-Data-Source',
    'Access-Control-Max-Age': '86400',
};
export function corsPreflight() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}
export function createResponse(result, error, status) {
    return new Response(JSON.stringify({ result, error }), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    });
}
export class BrowsableHandler {
    constructor(sql) {
        this.supportedRoutes = ['/query/raw'];
        this.sql = sql;
    }
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;
        // Check if this is a supported route that we should handle in our browsable
        // class. If no matches are found we call up to super and as a last resort
        // return a 404 to let the user know this inheritance class did not find a 
        // request to match on.
        if (this.supportedRoutes.includes(path)) {
            // Handle CORS preflight, at the moment this acts as a very permissive
            // acceptance of requests. Expecting the users to add in their own
            // version of authentication to protect against users misusing these
            // endpoints.
            if (request.method === 'OPTIONS') {
                return corsPreflight();
            }
            if (path === '/query/raw' && request.method === 'POST') {
                const { sql, params, transaction } = (await request.json());
                let data = await this.executeTransaction({
                    queries: transaction ?? [{ sql, params }]
                });
                return createResponse(data, undefined, 200);
            }
        }
        return new Response('Not found', { status: 404 });
    }
    async executeTransaction(opts) {
        const { queries } = opts;
        const results = [];
        for (const query of queries) {
            let result = await this.executeQuery({
                sql: query.sql,
                params: query.params ?? [],
                isRaw: true
            });
            if (!result) {
                console.error('Returning empty array.');
                return [];
            }
            results.push(result);
        }
        return results;
    }
    async executeRawQuery(opts) {
        const { sql, params } = opts;
        try {
            let cursor;
            if (params && params.length) {
                cursor = this.sql?.exec(sql, ...params);
            }
            else {
                cursor = this.sql?.exec(sql);
            }
            return cursor;
        }
        catch (error) {
            console.error('SQL Execution Error:', error);
            throw error;
        }
    }
    async executeQuery(opts) {
        const cursor = await this.executeRawQuery(opts);
        if (!cursor)
            return [];
        if (opts.isRaw) {
            return {
                columns: cursor.columnNames,
                rows: Array.from(cursor.raw()),
                meta: {
                    rows_read: cursor.rowsRead,
                    rows_written: cursor.rowsWritten,
                },
            };
        }
        return cursor.toArray();
    }
}
export function Browsable() {
    return function (constructor) {
        return class extends constructor {
            async fetch(request) {
                // Initialize handler if not already done
                if (!this._bdoHandler) {
                    this._bdoHandler = new BrowsableHandler(this.sql);
                }
                // Try browsable handler first
                const browsableResponse = await this._bdoHandler.fetch(request);
                // If browsable handler returns 404, try the parent class's fetch
                if (browsableResponse.status === 404) {
                    return super.fetch(request);
                }
                return browsableResponse;
            }
            async __studio(cmd) {
                const storage = this.ctx.storage;
                const sql = storage.sql;
                if (cmd.type === 'query') {
                    return executeQuery(sql, cmd.statement);
                }
                else if (cmd.type === 'transaction') {
                    return storage.transactionSync(() => {
                        const results = [];
                        for (const statement of cmd.statements) {
                            results.push(executeQuery(sql, statement));
                        }
                        return results;
                    });
                }
            }
        };
    };
}
export class BrowsableDurableObject extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.sql = undefined;
    }
    async fetch(request) {
        this._bdoHandler = new BrowsableHandler(this.sql);
        return this._bdoHandler.fetch(request);
    }
}
function executeQuery(sql, statement) {
    const cursor = sql.exec(statement);
    const columnSet = new Set();
    const columnNames = cursor.columnNames.map((colName) => {
        let renameColName = colName;
        for (let i = 0; i < 20; i++) {
            if (!columnSet.has(renameColName))
                break;
            renameColName = '__' + colName + '_' + i;
        }
        return {
            name: renameColName,
            displayName: colName,
            originalType: 'text',
            type: undefined,
        };
    });
    return {
        headers: columnNames,
        rows: Array.from(cursor.raw()).map((r) => columnNames.reduce((a, b, idx) => {
            a[b.name] = r[idx];
            return a;
        }, {})),
        stat: {
            queryDurationMs: 0,
            rowsAffected: 0,
            rowsRead: cursor.rowsRead,
            rowsWritten: cursor.rowsWritten,
        },
    };
}
function createHomepageInterface() {
    return `<!DOCTYPE >
  <html>
    <title>Outerbase Studio</title>
    <style>
      html, body {
        font-size: 20px;
        font-family: monospace;
        padding: 1rem;
      }

      #name, #submit {
        font-size: 1rem;
        padding: 0.2rem 0.5rem;
        outline: none;
        font-family: monospace;
      }

      h1 { font-size: 1.5rem; }

      p {
        padding: 0;
        margin: 10px 0;
      }
    </style>
  </html>
  <body>
    <h1>Outerbase Studio</h1>

    <form method='get' action=''>
       <p>env.MY_DURABLE_OBJECT.idFromName(</p>
       <div style="padding-left: 20px">
        <input id='name' name='id' placeholder='name' required></input>
        <button id='submit'>View</button>
       </div>
       <p>)</p>
    </form>
  </body>
  </html>`;
}
function createStudioInterface(stubId) {
    return `<!DOCTYPE >
  <html>
    <head>
      <style>
        html,
        body {
          padding: 0;
          margin: 0;
          width: 100vw;
          height: 100vh;
        }
  
        iframe {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          border: 0;
        }
      </style>
      <title>Your Starbase - Outerbase Studio</title>
      <link
        rel="icon"
        type="image/x-icon"
        href="https://studio.outerbase.com/icons/outerbase.ico"
      />
    </head>
    <body>
      <script>
        function handler(e) {
          if (e.data.type !== "query" && e.data.type !== "transaction") return;
  
          fetch(window.location.pathname, {
            method: "post",
            body: JSON.stringify({ ...e.data, id: ${JSON.stringify(stubId)} }),
          })
            .then((r) => {
              if (!r.ok) {
                document.getElementById("editor").contentWindow.postMessage(
                  {
                    id: e.data.id,
                    type: e.data.type,
                    error: "Something went wrong",
                  },
                  "*"
                );
                throw new Error("Something went wrong");
              }
              return r.json();
            })
            .then((r) => {
              if (r.error) {
                document.getElementById("editor").contentWindow.postMessage(
                  {
                    id: e.data.id,
                    type: e.data.type,
                    error: r.error,
                  },
                  "*"
                )
              }
  
              const response = {
                id: e.data.id,
                type: e.data.type,
                data: r.result
              };
  
              document
                .getElementById("editor")
                .contentWindow.postMessage(response, "*");
            })
            .catch(console.error);
        }
  
        window.addEventListener("message", handler);
      </script>
  
      <iframe
        id="editor"
        allow="clipboard-read; clipboard-write"
        src="https://studio.outerbase.com/embed/starbase"
      ></iframe>
    </body>
  </html>`;
}
export async function studio(request, doNamespace, options) {
    // Protecting
    if (options?.basicAuth) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            return new Response('Authentication required', {
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Basic realm="Secure Area"',
                },
            });
        }
        const encoded = authHeader.split(' ')[1];
        const decoded = atob(encoded);
        const [username, password] = decoded.split(':');
        if (username !== options.basicAuth.username || password !== options.basicAuth.password) {
            return new Response('Invalid credentials', {
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Basic realm="Secure Area"',
                },
            });
        }
    }
    // We run on a single endpoint, we will make use the METHOD to determine what to do
    if (request.method === 'GET') {
        // This is where we render the interface
        const url = new URL(request.url);
        const stubId = options?.enforceId ?? url.searchParams.get('id');
        if (!stubId) {
            if (options?.disableHomepage) {
                return new Response('Not found', { status: 404 });
            }
            return new Response(createHomepageInterface(), { headers: { 'Content-Type': 'text/html' } });
        }
        return new Response(createStudioInterface(stubId), { headers: { 'Content-Type': 'text/html' } });
    }
    else if (request.method === 'POST') {
        const body = (await request.json());
        if (body.type === 'query' || body.type === 'transaction') {
            const id = options?.enforceId ?? body.id;
            const stubId = doNamespace.idFromName(id);
            const stub = doNamespace.get(stubId);
            try {
                // @ts-ignore - accessing __studio method that we know exists
                const result = await stub.__studio(body);
                return Response.json({ result });
            }
            catch (e) {
                if (e instanceof Error) {
                    return Response.json({ error: e.message });
                }
                return Response.json({ error: 'Unknown error' });
            }
        }
        return Response.json({ error: 'Invalid request' });
    }
    return new Response('Method not allowed');
}
