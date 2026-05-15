# PMFreak/AOC SDK v1 (internal)

```ts
import { createAocClient } from "@/sdk";
```

Use server-side tokens. Browser clients should avoid long-lived secrets.

## Example
See `src/sdk/examples/basic.ts`.

Agent token issuance is currently server-managed/deferred.
