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
export class BrowsableDurableObject extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.supportedRoutes = ['/query/raw'];
    }
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;
        // Check if this is a supported route that we should handle
        if (this.supportedRoutes.includes(path)) {
            // Handle CORS preflight, at the moment this acts as a very
            // permissive acceptance of requests.
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
        // If not a supported route, call the derived class's fetch
        if (super.fetch) {
            return super.fetch(request);
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
