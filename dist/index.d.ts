import { DurableObject } from "cloudflare:workers";
export declare const corsHeaders: {
    readonly 'Access-Control-Allow-Origin': "*";
    readonly 'Access-Control-Allow-Methods': "GET, POST, PATCH, PUT, DELETE, OPTIONS";
    readonly 'Access-Control-Allow-Headers': "Authorization, Content-Type, X-Starbase-Source, X-Data-Source";
    readonly 'Access-Control-Max-Age': "86400";
};
export declare function corsPreflight(): Response;
export type QueryTransactionRequest = {
    transaction?: QueryRequest[];
};
export type QueryRequest = {
    sql: string;
    params?: any[];
};
export declare function createResponse(result: unknown, error: string | undefined, status: number): Response;
export declare class BrowsableHandler {
    sql: SqlStorage | undefined;
    private supportedRoutes;
    constructor(sql: SqlStorage | undefined);
    fetch(request: Request): Promise<Response>;
    executeTransaction(opts: {
        queries: {
            sql: string;
            params?: any[];
        }[];
    }): Promise<any>;
    private executeRawQuery;
    executeQuery(opts: {
        sql: string;
        params?: unknown[];
        isRaw?: boolean;
    }): Promise<Record<string, SqlStorageValue>[] | {
        columns: string[];
        rows: SqlStorageValue[][];
        meta: {
            rows_read: number;
            rows_written: number;
        };
    }>;
}
export declare function Browsable(): <T extends {
    new (...args: any[]): any;
}>(constructor: T) => {
    new (...args: any[]): {
        [x: string]: any;
        _bdoHandler?: BrowsableHandler;
        fetch(request: Request): Promise<Response>;
        __studio(cmd: StudioRequest): Promise<{
            headers: {
                name: string;
                displayName: string;
                originalType: string;
                type: undefined;
            }[];
            rows: Record<string, unknown>[];
            stat: {
                queryDurationMs: number;
                rowsAffected: number;
                rowsRead: number;
                rowsWritten: number;
            };
        } | {
            headers: {
                name: string;
                displayName: string;
                originalType: string;
                type: undefined;
            }[];
            rows: Record<string, unknown>[];
            stat: {
                queryDurationMs: number;
                rowsAffected: number;
                rowsRead: number;
                rowsWritten: number;
            };
        }[] | undefined>;
    };
} & T;
export declare class BrowsableDurableObject<TEnv = any> extends DurableObject<TEnv> {
    sql: SqlStorage | undefined;
    protected _bdoHandler?: BrowsableHandler;
    constructor(state: DurableObjectState, env: TEnv);
    fetch(request: Request): Promise<Response>;
}
/**
 * Studio
 * ------
 *
 * This is the built in Studio UI inside of the Browsable extension. It allows you to optionally
 * setup a route to enable it. The landing page has an input for you to decide which Durable Object
 * ID you want to view the data for. After you have entered the identifier the second page is the
 * Studio database browser experience.
 */
interface StudioQueryRequest {
    type: 'query';
    id: string;
    statement: string;
}
interface StudioTransactionRequest {
    type: 'transaction';
    id: string;
    statements: string[];
}
type StudioRequest = StudioQueryRequest | StudioTransactionRequest;
interface StudioOptions {
    basicAuth?: {
        username: string;
        password: string;
    };
}
export declare function studio(request: Request, doNamespace: DurableObjectNamespace<any>, options?: StudioOptions): Promise<Response>;
export {};
