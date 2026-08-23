// Shared between server (src/lib/r2.ts, signs it into the presigned PUT) and
// client (upload call sites, must send it as an actual PUT header — R2's
// presigned-URL signature covers CacheControl once it's set on the signing
// command, so the client's real request has to match exactly or the PUT gets
// a signature-mismatch 403). Kept in its own file, no imports, so client
// components pulling this in don't drag the AWS SDK (used by src/lib/r2.ts)
// into the browser bundle.
//
// Upload keys are deterministic per entity (tenants/<id>/products/<id>, etc.)
// and overwritten in place on re-upload -- "No versioning at the storage
// layer" is the documented, intentional design
// (specs/image-upload-architecture.md). A long/immutable cache would serve
// stale images after every edit, so this is short and revalidating.
export const R2_UPLOAD_CACHE_CONTROL = 'public, max-age=300, must-revalidate';
