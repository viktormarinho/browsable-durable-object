# @outerbase/browsable-durable-object

A browsable SQL query interface for Cloudflare Durable Objects.

## Installation

```bash
npm install @outerbase/browsable-durable-object
```

## Usage
Various ways to implement the browsable experience.

### Class Decorator
```typescript
import { DurableObject } from "cloudflare:workers";
import { Browsable } from "@outerbase/browsable-durable-object";

@Browsable()
export class MyDurableObject extends DurableObject<Env> {
    public sql: SqlStorage

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
        this.sql = ctx.storage.sql;
	}

    async fetch(request: Request): Promise<Response> {
        return new Response('Hello from MyDurableObject');
    }
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const path = new URL(request.url).pathname
		let id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(path);
		let stub = env.MY_DURABLE_OBJECT.get(id);

        return stub.fetch(request);
	}
} satisfies ExportedHandler<Env>;
```

### Inheritance
```typescript
export class MyDurableObject extends BrowsableDurableObject<Env> {
    public sql: SqlStorage

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
        this.sql = ctx.storage.sql
	}

    async fetch(request: Request): Promise<Response> {
        const baseResponse = await super.fetch(request);

        if (baseResponse.status === 404) {
            return new Response('Hello from MyDurableObject');
        }

        return baseResponse;
    }
}
```

### Composition
```typescript
export class MyDurableObject extends BrowsableDurableObject<Env> {
    public sql: SqlStorage
    private handler: BrowsableHandler;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
        this.sql = ctx.storage.sql
        this.handler = new BrowsableHandler(this.sql);
	}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;
        if (path === '/query/raw') {
            return await this.handler.fetch(request);
        }

        return new Response('Hello from MyDurableObject');
    }
}
```

### Studio UI Support
```typescript
import { DurableObject } from 'cloudflare:workers';
import { Browsable, studio } from './browsable';

@Browsable()
export class MyDurableObject extends DurableObject<Env> {}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/studio') {
			return await studio(request, env.MY_DURABLE_OBJECT, {
				basicAuth: {
					username: 'admin',
					password: 'password',
				},
			});
		}

		// the rest of your code here
		// ....

		return new Response('Hello World', { status: 200 });
	},
} satisfies ExportedHandler<Env>;
```

## License

MIT