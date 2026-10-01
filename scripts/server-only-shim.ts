/**
 * Lets a script import src/lib modules that guard themselves with
 * `import "server-only"` — a marker Next.js resolves at build time and that
 * isn't installed as a package. A script is server-side, so the marker
 * resolves to this (empty) module. Import it before any src/lib module.
 */
import Module from "module";

const mod = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolve = mod._resolveFilename;
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolve.call(this, request === "server-only" ? __filename : request, ...rest);
};

export {};
